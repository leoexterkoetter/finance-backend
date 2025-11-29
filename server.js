// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ------------- CONFIG (exigir variáveis) -------------
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://mongo:nHvWVyeStJDGBRGkJRpyFIhuKKhwBHoQ@shinkansen.proxy.rlwy.net:48390';
const DB_NAME = process.env.DB_NAME || 'finance_app';
const JWT_SECRET =
  process.env.JWT_SECRET || 'dev_secret_finance_app_123';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida. Defina a variável de ambiente.');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET não definida. Defina a variável de ambiente.');
  process.exit(1);
}

// ------------- Conexão MongoDB reutilizável -------------
let client;
let db;

async function connectDB() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  db = client.db(DB_NAME);
  console.log('✅ Conectado ao MongoDB');
  return db;
}

// ------------- Middleware de autenticação -------------
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token ausente' });

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // decoded pode conter { id: usuarioId, email }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// ------------- Helpers -------------
function safeObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (e) {
    return null;
  }
}

// ------------- ROTAS (Exemplos refatorados) -------------

// Rota de health
app.get('/', (req, res) => {
  res.json({
    message: '🚀 API Finance App rodando!',
    versao: '2.3-refactor',
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

// -------------------- AUTENTICAÇÃO --------------------

// POST - Cadastro (com hash)
app.post('/api/cadastro', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha' });
    }

    const db = await connectDB();

    const usuarioExistente = await db.collection('usuarios').findOne({ email });
    if (usuarioExistente) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = {
      nome,
      email,
      senha: senhaHash,
      criado_em: new Date()
    };

    const result = await db.collection('usuarios').insertOne(novoUsuario);

    // gerar token opcional
    const token = generateToken({ id: result.insertedId.toString(), email });

    res.json({
      id: result.insertedId.toString(),
      nome,
      email,
      token,
      message: 'Usuário cadastrado com sucesso'
    });
  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

// POST - Login (gera JWT)
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
    }

    const db = await connectDB();

    const usuario = await db.collection('usuarios').findOne({ email });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const senhaValida = usuario.senha.startsWith('$2')
  ? await bcrypt.compare(senha, usuario.senha)
  : usuario.senha === senha;

    const token = generateToken({ id: usuario._id.toString(), email: usuario.email });

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

// -------------------- TRANSAÇÕES --------------------

// GET - Buscar todas as transações de um usuário
app.get('/api/transacoes/:usuario_id', async (req, res) => {
  try {
    const db = await connectDB();
    const usuarioId = req.params.usuario_id;

    const transacoes = await db.collection('transacoes')
      .find({ usuario_id: usuarioId })
      .sort({ data: -1 })
      .toArray();

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

// Protegendo criação/edição/deleção de transações
app.post('/api/transacoes', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const novaTransacao = {
      ...req.body,
      criado_em: new Date()
    };

    const result = await db.collection('transacoes').insertOne(novaTransacao);
    res.json({
      id: result.insertedId.toString(),
      message: 'Transação criada com sucesso'
    });
  } catch (err) {
    console.error('Erro ao criar transação:', err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

app.post('/api/transacoes/parcelada', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { usuario_id, valor, categoria, tipo, data, descricao, fixo, pago, parcelas } = req.body;

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
        parcela_atual: i + 1,
        criado_em: new Date()
      });
    }

    const result = await db.collection('transacoes').insertMany(transacoes);

    res.json({
      id: Object.values(result.insertedIds).map(id => id.toString()),
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
    const db = await connectDB();
    const { id } = req.params;
    const atualizacao = { ...req.body };
    delete atualizacao._id;
    delete atualizacao.id;

    await db.collection('transacoes').updateOne(
      { _id: new ObjectId(id) },
      { $set: atualizacao }
    );

    res.json({ message: 'Transação atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar transação:', err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// DELETE - Deletar transação
app.delete('/api/transacoes/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    await db.collection('transacoes').deleteOne({ _id: new ObjectId(id) });

    res.json({ message: 'Transação deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar transação:', err);
    res.status(500).json({ error: 'Erro ao deletar transação' });
  }
});

// -------------------- CAIXINHAS --------------------

app.get('/api/caixinhas/:usuario_id', async (req, res) => {
  try {
    const db = await connectDB();
    const caixinhas = await db.collection('caixinhas')
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .toArray();

    const caixinhasFormatadas = caixinhas.map(c => ({ ...c, id: c._id.toString() }));
    res.json(caixinhasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar caixinhas:', err);
    res.status(500).json({ error: 'Erro ao buscar caixinhas' });
  }
});

app.post('/api/caixinhas', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const novaCaixinha = {
      ...req.body,
      valor_pago: 0,
      parcelas_pagas: 0,
      criado_em: new Date()
    };

    const result = await db.collection('caixinhas').insertOne(novaCaixinha);
    res.json({ id: result.insertedId.toString(), message: 'Caixinha criada com sucesso' });
  } catch (err) {
    console.error('Erro ao criar caixinha:', err);
    res.status(500).json({ error: 'Erro ao criar caixinha' });
  }
});

app.put('/api/caixinhas/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;
    const atualizacao = { ...req.body };
    delete atualizacao._id;
    delete atualizacao.id;

    await db.collection('caixinhas').updateOne(
      { _id: new ObjectId(id) },
      { $set: atualizacao }
    );

    res.json({ message: 'Caixinha atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar caixinha:', err);
    res.status(500).json({ error: 'Erro ao atualizar caixinha' });
  }
});

app.put('/api/caixinhas/:id/pagar', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;
    const { valor } = req.body;

    const caixinha = await db.collection('caixinhas').findOne({ _id: new ObjectId(id) });

    if (!caixinha) {
      return res.status(404).json({ error: 'Caixinha não encontrada' });
    }

    const novoValorPago = (caixinha.valor_pago || 0) + parseFloat(valor);
    const novasParcelasPagas = (caixinha.parcelas_pagas || 0) + 1;

    await db.collection('caixinhas').updateOne(
      { _id: new ObjectId(id) },
      { $set: { valor_pago: novoValorPago, parcelas_pagas: novasParcelasPagas } }
    );

    res.json({
      message: 'Parcela paga com sucesso',
      valor_pago: novoValorPago,
      parcelas_pagas: novasParcelasPagas
    });
  } catch (err) {
    console.error('Erro ao pagar parcela:', err);
    res.status(500).json({ error: 'Erro ao pagar parcela' });
  }
});

app.delete('/api/caixinhas/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    const count = await db.collection('transacoes').countDocuments({ categoria_custom_id: id });
    if (count > 0) {
      return res.status(400).json({ error: `Não é possível deletar. Existem ${count} transações usando esta categoria.` });
    }

    await db.collection('caixinhas').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Caixinha deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar caixinha:', err);
    res.status(500).json({ error: 'Erro ao deletar caixinha' });
  }
});

// -------------------- CATEGORIAS CUSTOMIZADAS --------------------

app.get('/api/categorias/:usuario_id', async (req, res) => {
  try {
    const db = await connectDB();
    const categorias = await db.collection('categorias_customizadas')
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .toArray();

    const categoriasFormatadas = categorias.map(c => ({ ...c, id: c._id.toString() }));
    res.json(categoriasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar categorias:', err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

app.post('/api/categorias', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { usuario_id, nome, icone, cor, tipo } = req.body;
    if (!usuario_id || !nome || !tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios: usuario_id, nome, tipo' });
    }

    const existente = await db.collection('categorias_customizadas').findOne({ usuario_id, nome });
    if (existente) return res.status(400).json({ error: 'Já existe uma categoria com este nome' });

    const novaCategoria = {
      usuario_id,
      nome,
      icone: icone || 'Tag',
      cor: cor || '#6B7280',
      tipo,
      criado_em: new Date()
    };

    const result = await db.collection('categorias_customizadas').insertOne(novaCategoria);
    res.json({ id: result.insertedId.toString(), ...novaCategoria, message: 'Categoria criada com sucesso' });
  } catch (err) {
    console.error('Erro ao criar categoria:', err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

app.put('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;
    const { nome, icone, cor, tipo } = req.body;

    const atualizacao = {};
    if (nome !== undefined) atualizacao.nome = nome;
    if (icone !== undefined) atualizacao.icone = icone;
    if (cor !== undefined) atualizacao.cor = cor;
    if (tipo !== undefined) atualizacao.tipo = tipo;

    await db.collection('categorias_customizadas').updateOne(
      { _id: new ObjectId(id) },
      { $set: atualizacao }
    );

    res.json({ message: 'Categoria atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao editar categoria:', err);
    res.status(500).json({ error: 'Erro ao editar categoria' });
  }
});

app.delete('/api/categorias/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    const count = await db.collection('transacoes').countDocuments({ categoria_custom_id: id });
    if (count > 0) return res.status(400).json({ error: `Não é possível deletar. Existem ${count} transações usando esta categoria.` });

    await db.collection('categorias_customizadas').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Categoria deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar categoria:', err);
    res.status(500).json({ error: 'Erro ao deletar categoria' });
  }
});

// -------------------- CONTAS --------------------

app.get('/api/contas/:usuario_id', async (req, res) => {
  try {
    const db = await connectDB();
    const contas = await db.collection('contas')
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .toArray();

    const contasFormatadas = contas.map(c => ({ ...c, id: c._id.toString() }));
    res.json(contasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar contas:', err);
    res.status(500).json({ error: 'Erro ao buscar contas' });
  }
});

app.post('/api/contas', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { usuario_id, nome, tipo, limite, saldo_atual, cor, icone } = req.body;

    if (!usuario_id || !nome || !tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios: usuario_id, nome, tipo' });
    }

    const novaConta = {
      usuario_id,
      nome,
      tipo,
      limite: parseFloat(limite) || 0,
      saldo_atual: parseFloat(saldo_atual) || 0,
      cor: cor || '#3B82F6',
      icone: icone || 'CreditCard',
      ativa: true,
      criado_em: new Date()
    };

    const result = await db.collection('contas').insertOne(novaConta);
    res.json({ id: result.insertedId.toString(), ...novaConta, message: 'Conta criada com sucesso' });
  } catch (err) {
    console.error('Erro ao criar conta:', err);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

app.put('/api/contas/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;
    const { nome, tipo, limite, saldo_atual, cor, icone, ativa } = req.body;

    const atualizacao = {};
    if (nome !== undefined) atualizacao.nome = nome;
    if (tipo !== undefined) atualizacao.tipo = tipo;
    if (limite !== undefined) atualizacao.limite = parseFloat(limite);
    if (saldo_atual !== undefined) atualizacao.saldo_atual = parseFloat(saldo_atual);
    if (cor !== undefined) atualizacao.cor = cor;
    if (icone !== undefined) atualizacao.icone = icone;
    if (ativa !== undefined) atualizacao.ativa = ativa;

    await db.collection('contas').updateOne(
      { _id: new ObjectId(id) },
      { $set: atualizacao }
    );

    res.json({ message: 'Conta atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao editar conta:', err);
    res.status(500).json({ error: 'Erro ao editar conta' });
  }
});

app.delete('/api/contas/:id', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    const count = await db.collection('transacoes').countDocuments({ conta_id: id });
    if (count > 0) return res.status(400).json({ error: `Não é possível deletar. Existem ${count} transações nesta conta.` });

    await db.collection('contas').deleteOne({ _id: new ObjectId(id) });
    res.json({ message: 'Conta deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar conta:', err);
    res.status(500).json({ error: 'Erro ao deletar conta' });
  }
});

// -------------------- SALDO (exemplo de rota protegida + utilitária) --------------------

app.get('/api/contas/:id/saldo', requireAuth, async (req, res) => {
  try {
    const db = await connectDB();
    const { id } = req.params;

    const conta = await db.collection('contas').findOne({ _id: new ObjectId(id) });
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada' });

    const transacoes = await db.collection('transacoes').find({ conta_id: id, pago: false }).toArray();
    const totalNaoPago = transacoes.reduce((sum, t) => sum + (t.tipo === 'gasto' ? t.valor : -t.valor), 0);

    const resultado = {
      conta_id: id,
      nome: conta.nome,
      tipo: conta.tipo,
      saldo_atual: conta.saldo_atual,
      total_nao_pago: totalNaoPago
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

// ------------- Start (garantir DB conectado primeiro) -------------
(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Erro ao iniciar o servidor:', err);
    process.exit(1);
  }
})();

module.exports = app;
