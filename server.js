// server.js - VERSÃO MONGOOSE OTIMIZADA
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ========================================
// CONFIGURAÇÃO
// ========================================
const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb://mongo:nHvWVyeStJDGBRGkJRpyFIhuKKhwBHoQ@shinkansen.proxy.rlwy.net:48390';
const DB_NAME = process.env.DB_NAME || 'test';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_finance_app_123';

if (!MONGODB_URI || !JWT_SECRET) {
  console.error('❌ Variáveis de ambiente faltando!');
  process.exit(1);
}

// ========================================
// SCHEMAS MONGOOSE
// ========================================

// USUÁRIO
const usuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,  // ✅ unique já cria índice automaticamente
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido']
  },
  senha: { type: String, required: true, minlength: 6 },
  criado_em: { type: Date, default: Date.now }
}, { collection: 'usuarios' });

// ❌ REMOVIDO: usuarioSchema.index({ email: 1 }); - Duplicado!

// TRANSAÇÃO
const transacaoSchema = new mongoose.Schema({
  usuario_id: { type: String, required: true, index: true },
  valor: { type: Number, required: true, min: 0 },
  categoria: { type: String, required: true, trim: true },
  tipo: { 
    type: String, 
    required: true, 
    enum: ['gasto', 'receita'],
    lowercase: true 
  },
  data: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)']
  },
  descricao: { type: String, default: '', trim: true },
  fixo: { type: Boolean, default: false },
  pago: { type: Boolean, default: false },
  parcelas: { type: Number, default: 1, min: 1 },
  parcela_atual: { type: Number, default: 1, min: 1 },
  conta_id: { type: String, default: null },
  categoria_custom_id: { type: String, default: null },
  criado_em: { type: Date, default: Date.now }
}, { collection: 'transacoes' });

// Índices compostos para performance
transacaoSchema.index({ usuario_id: 1, data: -1 });
transacaoSchema.index({ usuario_id: 1, tipo: 1 });
transacaoSchema.index({ usuario_id: 1, pago: 1 });

// CAIXINHA
const caixinhaSchema = new mongoose.Schema({
  usuario_id: { type: String, required: true, index: true },
  nome: { type: String, required: true, trim: true },
  valor_total: { type: Number, required: true, min: 0 },
  valor_pago: { type: Number, default: 0, min: 0 },
  parcelas_total: { type: Number, required: true, min: 1 },
  parcelas_pagas: { type: Number, default: 0, min: 0 },
  data_inicio: { 
    type: String, 
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Data inválida']
  },
  criado_em: { type: Date, default: Date.now }
}, { collection: 'caixinhas' });

caixinhaSchema.index({ usuario_id: 1, criado_em: -1 });

// CATEGORIA CUSTOMIZADA
const categoriaSchema = new mongoose.Schema({
  usuario_id: { type: String, required: true, index: true },
  nome: { type: String, required: true, trim: true },
  icone: { type: String, default: 'Tag' },
  cor: { 
    type: String, 
    default: '#6B7280',
    match: [/^#[0-9A-F]{6}$/i, 'Cor inválida (use #RRGGBB)']
  },
  tipo: { 
    type: String, 
    required: true,
    enum: ['fixo', 'variavel', 'receita'],
    lowercase: true
  },
  criado_em: { type: Date, default: Date.now }
}, { collection: 'categorias_customizadas' });

categoriaSchema.index({ usuario_id: 1, nome: 1 }, { unique: true });
categoriaSchema.index({ usuario_id: 1, tipo: 1 });

// CONTA/CARTÃO
const contaSchema = new mongoose.Schema({
  usuario_id: { type: String, required: true, index: true },
  nome: { type: String, required: true, trim: true },
  tipo: { 
    type: String, 
    required: true,
    enum: ['cartao_credito', 'cartao_debito', 'conta_corrente', 'poupanca', 'dinheiro']
  },
  limite: { type: Number, default: 0, min: 0 },
  saldo_atual: { type: Number, default: 0 },
  cor: { 
    type: String, 
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'Cor inválida']
  },
  icone: { type: String, default: 'CreditCard' },
  ativa: { type: Boolean, default: true },
  criado_em: { type: Date, default: Date.now }
}, { collection: 'contas' });

contaSchema.index({ usuario_id: 1, ativa: 1 });
contaSchema.index({ usuario_id: 1, tipo: 1 });

// Criar Models
const Usuario = mongoose.model('Usuario', usuarioSchema);
const Transacao = mongoose.model('Transacao', transacaoSchema);
const Caixinha = mongoose.model('Caixinha', caixinhaSchema);
const Categoria = mongoose.model('Categoria', categoriaSchema);
const Conta = mongoose.model('Conta', contaSchema);

// ========================================
// CONEXÃO MONGOOSE
// ========================================
mongoose.connect(MONGODB_URI, {
  dbName: DB_NAME
})
.then(() => {
  console.log('✅ Conectado ao MongoDB via Mongoose');
  console.log(`📊 Database: ${DB_NAME}`);
})
.catch(err => {
  console.error('❌ Erro ao conectar MongoDB:', err);
  process.exit(1);
});

// ========================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ========================================
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token ausente' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ========================================
// ROTA RAIZ
// ========================================
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Finance App rodando!',
    versao: '2.4-mongoose',
    endpoints: {
      transacoes: '/api/transacoes/:usuario_id',
      caixinhas: '/api/caixinhas/:usuario_id',
      categorias: '/api/categorias/:usuario_id',
      contas: '/api/contas/:usuario_id',
      login: '/api/login',
      cadastro: '/api/cadastro'
    }
  });
});

// ========================================
// AUTENTICAÇÃO
// ========================================

// POST - Cadastro
app.post('/api/cadastro', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
    }

    // Verificar se email já existe
    const existente = await Usuario.findOne({ email });
    if (existente) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar usuário
    const usuario = await Usuario.create({
      nome,
      email,
      senha: senhaHash
    });

    // Gerar token
    const token = generateToken({ 
      id: usuario._id.toString(), 
      email: usuario.email 
    });

    res.json({
      id: usuario._id.toString(),
      nome: usuario.nome,
      email: usuario.email,
      token,
      message: 'Usuário cadastrado com sucesso'
    });
  } catch (err) {
    console.error('Erro ao cadastrar:', err);
    
    // Erro de validação do Mongoose
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

// POST - Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
    }

    // Buscar usuário
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar senha (compatível com senhas antigas não-hash)
    const senhaValida = usuario.senha.startsWith('$2')
      ? await bcrypt.compare(senha, usuario.senha)
      : usuario.senha === senha;

    if (!senhaValida) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Gerar token
    const token = generateToken({ 
      id: usuario._id.toString(), 
      email: usuario.email 
    });

    res.json({
      id: usuario._id.toString(),
      nome: usuario.nome,
      email: usuario.email,
      token
    });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// ========================================
// TRANSAÇÕES
// ========================================

// GET - Listar transações
app.get('/api/transacoes/:usuario_id', async (req, res) => {
  try {
    const transacoes = await Transacao
      .find({ usuario_id: req.params.usuario_id })
      .sort({ data: -1 })
      .lean(); // .lean() retorna objeto JS puro (mais rápido)

    // Adicionar campo 'id' para compatibilidade com frontend
    const transacoesFormatadas = transacoes.map(t => ({
      ...t,
      id: t._id.toString()
    }));

    res.json(transacoesFormatadas);
  } catch (err) {
    console.error('Erro ao buscar transações:', err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// POST - Criar transação única
app.post('/api/transacoes', requireAuth, async (req, res) => {
  try {
    const transacao = await Transacao.create({
      ...req.body,
      valor: parseFloat(req.body.valor),
      fixo: Boolean(req.body.fixo),
      pago: Boolean(req.body.pago)
    });

    res.json({
      id: transacao._id.toString(),
      message: 'Transação criada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao criar transação:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// POST - Criar transação parcelada
app.post('/api/transacoes/parcelada', requireAuth, async (req, res) => {
  try {
    const { usuario_id, valor, categoria, tipo, data, descricao, fixo, parcelas } = req.body;

    const dataInicio = new Date(data);
    const transacoes = [];

    for (let i = 0; i < parcelas; i++) {
      const dataTransacao = new Date(dataInicio);
      dataTransacao.setMonth(dataTransacao.getMonth() + i);

      transacoes.push({
        usuario_id,
        valor: parseFloat(valor),
        categoria,
        tipo,
        data: dataTransacao.toISOString().slice(0, 10),
        descricao: descricao ? `${descricao} (${i + 1}/${parcelas})` : `Parcela ${i + 1}/${parcelas}`,
        fixo: Boolean(fixo),
        pago: false,
        parcelas: parseInt(parcelas),
        parcela_atual: i + 1
      });
    }

    const result = await Transacao.insertMany(transacoes);

    res.json({
      ids: result.map(t => t._id.toString()),
      message: `${parcelas} parcelas criadas com sucesso`,
      quantidade: parcelas
    });
  } catch (err) {
    console.error('Erro ao criar transação parcelada:', err);
    res.status(500).json({ error: 'Erro ao criar transação parcelada' });
  }
});

// PUT - Atualizar transação
app.put('/api/transacoes/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    delete update._id;
    delete update.id;

    // Converter tipos se necessário
    if (update.valor) update.valor = parseFloat(update.valor);
    if (update.fixo !== undefined) update.fixo = Boolean(update.fixo);
    if (update.pago !== undefined) update.pago = Boolean(update.pago);

    await Transacao.findByIdAndUpdate(id, update);

    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar transação:', err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// DELETE - Deletar transação
app.delete('/api/transacoes/:id', requireAuth, async (req, res) => {
  try {
    await Transacao.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transação deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar transação:', err);
    res.status(500).json({ error: 'Erro ao deletar transação' });
  }
});

// ========================================
// CAIXINHAS
// ========================================

// GET - Listar caixinhas
app.get('/api/caixinhas/:usuario_id', async (req, res) => {
  try {
    const caixinhas = await Caixinha
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .lean();

    const caixinhasFormatadas = caixinhas.map(c => ({
      ...c,
      id: c._id.toString()
    }));

    res.json(caixinhasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar caixinhas:', err);
    res.status(500).json({ error: 'Erro ao buscar caixinhas' });
  }
});

// POST - Criar caixinha
app.post('/api/caixinhas', requireAuth, async (req, res) => {
  try {
    const caixinha = await Caixinha.create({
      ...req.body,
      valor_total: parseFloat(req.body.valor_total),
      parcelas_total: parseInt(req.body.parcelas_total)
    });

    res.json({
      id: caixinha._id.toString(),
      message: 'Caixinha criada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao criar caixinha:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Erro ao criar caixinha' });
  }
});

// PUT - Atualizar caixinha
app.put('/api/caixinhas/:id', requireAuth, async (req, res) => {
  try {
    const update = { ...req.body };
    delete update._id;
    delete update.id;

    if (update.valor_total) update.valor_total = parseFloat(update.valor_total);
    if (update.valor_pago) update.valor_pago = parseFloat(update.valor_pago);
    if (update.parcelas_total) update.parcelas_total = parseInt(update.parcelas_total);
    if (update.parcelas_pagas) update.parcelas_pagas = parseInt(update.parcelas_pagas);

    await Caixinha.findByIdAndUpdate(req.params.id, update);

    res.json({ message: 'Caixinha atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar caixinha:', err);
    res.status(500).json({ error: 'Erro ao atualizar caixinha' });
  }
});

// PUT - Pagar parcela
app.put('/api/caixinhas/:id/pagar', requireAuth, async (req, res) => {
  try {
    const { valor } = req.body;
    const caixinha = await Caixinha.findById(req.params.id);

    if (!caixinha) {
      return res.status(404).json({ error: 'Caixinha não encontrada' });
    }

    caixinha.valor_pago += parseFloat(valor);
    caixinha.parcelas_pagas += 1;
    await caixinha.save();

    res.json({
      message: 'Parcela paga com sucesso',
      valor_pago: caixinha.valor_pago,
      parcelas_pagas: caixinha.parcelas_pagas
    });
  } catch (err) {
    console.error('Erro ao pagar parcela:', err);
    res.status(500).json({ error: 'Erro ao pagar parcela' });
  }
});

// DELETE - Deletar caixinha
app.delete('/api/caixinhas/:id', requireAuth, async (req, res) => {
  try {
    await Caixinha.findByIdAndDelete(req.params.id);
    res.json({ message: 'Caixinha deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar caixinha:', err);
    res.status(500).json({ error: 'Erro ao deletar caixinha' });
  }
});

// ========================================
// CATEGORIAS CUSTOMIZADAS
// ========================================

// GET - Listar categorias
app.get('/api/categorias/:usuario_id', async (req, res) => {
  try {
    const categorias = await Categoria
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .lean();

    const categoriasFormatadas = categorias.map(c => ({
      ...c,
      id: c._id.toString()
    }));

    res.json(categoriasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar categorias:', err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// POST - Criar categoria
app.post('/api/categorias', requireAuth, async (req, res) => {
  try {
    const { usuario_id, nome, icone, cor, tipo } = req.body;

    if (!usuario_id || !nome || !tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios: usuario_id, nome, tipo' });
    }

    // Verificar duplicata
    const existente = await Categoria.findOne({ usuario_id, nome });
    if (existente) {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
    }

    const categoria = await Categoria.create({
      usuario_id,
      nome,
      icone: icone || 'Tag',
      cor: cor || '#6B7280',
      tipo
    });

    res.json({
      id: categoria._id.toString(),
      ...categoria.toObject(),
      message: 'Categoria criada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao criar categoria:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// PUT - Editar categoria
app.put('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const { nome, icone, cor, tipo } = req.body;
    const update = {};
    
    if (nome) update.nome = nome;
    if (icone) update.icone = icone;
    if (cor) update.cor = cor;
    if (tipo) update.tipo = tipo;

    await Categoria.findByIdAndUpdate(req.params.id, update);

    res.json({ message: 'Categoria atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao editar categoria:', err);
    res.status(500).json({ error: 'Erro ao editar categoria' });
  }
});

// DELETE - Deletar categoria
app.delete('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    // Verificar se há transações usando essa categoria
    const count = await Transacao.countDocuments({
      categoria_custom_id: req.params.id
    });

    if (count > 0) {
      return res.status(400).json({
        error: `Não é possível deletar. Existem ${count} transações usando esta categoria.`
      });
    }

    await Categoria.findByIdAndDelete(req.params.id);

    res.json({ message: 'Categoria deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar categoria:', err);
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

// ========================================
// CONTAS/CARTÕES
// ========================================

// GET - Listar contas
app.get('/api/contas/:usuario_id', async (req, res) => {
  try {
    const contas = await Conta
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .lean();

    const contasFormatadas = contas.map(c => ({
      ...c,
      id: c._id.toString()
    }));

    res.json(contasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar contas:', err);
    res.status(500).json({ error: 'Erro ao buscar contas' });
  }
});

// POST - Criar conta
app.post('/api/contas', requireAuth, async (req, res) => {
  try {
    const conta = await Conta.create({
      ...req.body,
      limite: parseFloat(req.body.limite) || 0,
      saldo_atual: parseFloat(req.body.saldo_atual) || 0
    });

    res.json({
      id: conta._id.toString(),
      ...conta.toObject(),
      message: 'Conta criada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao criar conta:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

// PUT - Editar conta
app.put('/api/contas/:id', requireAuth, async (req, res) => {
  try {
    const update = { ...req.body };
    delete update._id;
    delete update.id;

    if (update.limite) update.limite = parseFloat(update.limite);
    if (update.saldo_atual) update.saldo_atual = parseFloat(update.saldo_atual);

    await Conta.findByIdAndUpdate(req.params.id, update);

    res.json({ message: 'Conta atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao editar conta:', err);
    res.status(500).json({ error: 'Erro ao editar conta' });
  }
});

// DELETE - Deletar conta
app.delete('/api/contas/:id', requireAuth, async (req, res) => {
  try {
    const count = await Transacao.countDocuments({
      conta_id: req.params.id
    });

    if (count > 0) {
      return res.status(400).json({
        error: `Não é possível deletar. Existem ${count} transações nesta conta.`
      });
    }

    await Conta.findByIdAndDelete(req.params.id);

    res.json({ message: 'Conta deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar conta:', err);
    res.status(500).json({ error: 'Erro ao deletar conta' });
  }
});

// GET - Calcular saldo de uma conta
app.get('/api/contas/:id/saldo', async (req, res) => {
  try {
    const conta = await Conta.findById(req.params.id);

    if (!conta) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    // Buscar transações não pagas
    const transacoes = await Transacao
      .find({ conta_id: req.params.id, pago: false })
      .lean();

    const totalNaoPago = transacoes.reduce((sum, t) => {
      return sum + (t.tipo === 'gasto' ? t.valor : -t.valor);
    }, 0);

    const resultado = {
      conta_id: req.params.id,
      nome: conta.nome,
      tipo: conta.tipo,
      saldo_atual: conta.saldo_atual,
      total_nao_pago: totalNaoPago,
    };

    if (conta.tipo === 'cartao_credito') {
      resultado.limite = conta.limite;
      resultado.disponivel = conta.limite - totalNaoPago;
      resultado.percentual_usado = ((totalNaoPago / conta.limite) * 100).toFixed(1);
    } else {
      resultado.saldo_disponivel = conta.saldo_atual - totalNaoPago;
    }

    res.json(resultado);
  } catch (err) {
    console.error('Erro ao calcular saldo:', err);
    res.status(500).json({ error: 'Erro ao calcular saldo' });
  }
});

// ========================================
// SERVIDOR
// ========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Endpoints disponíveis:`);
  console.log(`   - Transações: GET/POST/PUT/DELETE`);
  console.log(`   - Caixinhas: GET/POST/PUT/DELETE`);
  console.log(`   - Categorias: GET/POST/PUT/DELETE`);
  console.log(`   - Contas: GET/POST/PUT/DELETE`);
});

module.exports = app;