const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'finance_app';

let db;

MongoClient.connect(MONGODB_URI)
  .then(client => {
    console.log('✅ Conectado ao MongoDB');
    db = client.db(DB_NAME);
  })
  .catch(err => console.error('❌ Erro ao conectar MongoDB:', err));

// ========================================
// ROTAS DE TRANSAÇÕES
// ========================================

// GET - Buscar todas as transações de um usuário
app.get('/api/transacoes/:usuario_id', async (req, res) => {
  try {
    const transacoes = await db.collection('transacoes')
      .find({ usuario_id: req.params.usuario_id })
      .sort({ data: -1 })
      .toArray();
    
    // Converter _id para id
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
app.post('/api/transacoes', async (req, res) => {
  try {
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

// POST - Criar transação parcelada
app.post('/api/transacoes/parcelada', async (req, res) => {
  try {
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
app.put('/api/transacoes/:id', async (req, res) => {
  try {
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
app.delete('/api/transacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('transacoes').deleteOne({ _id: new ObjectId(id) });
    
    res.json({ message: 'Transação deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar transação:', err);
    res.status(500).json({ error: 'Erro ao deletar transação' });
  }
});

// ========================================
// ROTAS DE CAIXINHAS
// ========================================

// GET - Buscar todas as caixinhas de um usuário
app.get('/api/caixinhas/:usuario_id', async (req, res) => {
  try {
    const caixinhas = await db.collection('caixinhas')
      .find({ usuario_id: req.params.usuario_id })
      .sort({ criado_em: -1 })
      .toArray();
    
    // Converter _id para id
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
app.post('/api/caixinhas', async (req, res) => {
  try {
    const novaCaixinha = {
      ...req.body,
      valor_pago: 0,
      parcelas_pagas: 0,
      criado_em: new Date()
    };
    
    const result = await db.collection('caixinhas').insertOne(novaCaixinha);
    
    res.json({ 
      id: result.insertedId.toString(),
      message: 'Caixinha criada com sucesso' 
    });
  } catch (err) {
    console.error('Erro ao criar caixinha:', err);
    res.status(500).json({ error: 'Erro ao criar caixinha' });
  }
});

// ✅ NOVO: PUT - Atualizar caixinha
app.put('/api/caixinhas/:id', async (req, res) => {
  try {
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

// PUT - Pagar parcela da caixinha
app.put('/api/caixinhas/:id/pagar', async (req, res) => {
  try {
    const { id } = req.params;
    const { valor } = req.body;
    
    const caixinha = await db.collection('caixinhas').findOne({ _id: new ObjectId(id) });
    
    if (!caixinha) {
      return res.status(404).json({ error: 'Caixinha não encontrada' });
    }
    
    const novoValorPago = caixinha.valor_pago + parseFloat(valor);
    const novasParcelasPagas = caixinha.parcelas_pagas + 1;
    
    await db.collection('caixinhas').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          valor_pago: novoValorPago,
          parcelas_pagas: novasParcelasPagas
        } 
      }
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

// DELETE - Deletar caixinha
app.delete('/api/caixinhas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('caixinhas').deleteOne({ _id: new ObjectId(id) });
    
    res.json({ message: 'Caixinha deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar caixinha:', err);
    res.status(500).json({ error: 'Erro ao deletar caixinha' });
  }
});

// ========================================
// ROTAS DE AUTENTICAÇÃO (Simplificada)
// ========================================

// POST - Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    const usuario = await db.collection('usuarios').findOne({ email });
    
    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    if (usuario.senha !== senha) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    
    res.json({
      id: usuario._id.toString(),
      nome: usuario.nome,
      email: usuario.email
    });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// POST - Cadastro
app.post('/api/cadastro', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    
    const usuarioExistente = await db.collection('usuarios').findOne({ email });
    
    if (usuarioExistente) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    
    const novoUsuario = {
      nome,
      email,
      senha,
      criado_em: new Date()
    };
    
    const result = await db.collection('usuarios').insertOne(novoUsuario);
    
    res.json({
      id: result.insertedId.toString(),
      nome,
      email,
      message: 'Usuário cadastrado com sucesso'
    });
  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }
});

// ========================================
// SERVIDOR
// ========================================

app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 API Finance App rodando!',
    versao: '2.0',
    endpoints: {
      transacoes: '/api/transacoes/:usuario_id',
      caixinhas: '/api/caixinhas/:usuario_id',
      login: '/api/login',
      cadastro: '/api/cadastro'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

module.exports = app;