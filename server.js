import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors({
  origin: [
    'https://finance-frontendd.vercel.app', // Sua URL Vercel
    'http://localhost:3000'
  ],
  credentials: true
}));

// --------------------------------------
// 🔗 CONEXÃO MONGODB
// --------------------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.error("Erro MongoDB:", err));


// --------------------------------------
// 📦 MODELOS (equivalentes às tabelas)
// --------------------------------------

const UsuarioSchema = new mongoose.Schema({
  nome: String,
  email: { type: String, unique: true },
  senha: String
});

const Usuario = mongoose.model("Usuario", UsuarioSchema);

const TransacaoSchema = new mongoose.Schema({
  usuario_id: String,
  valor: Number,
  categoria: String,
  tipo: String,
  data: String,
  descricao: String,
  fixo: Boolean,
  pago: Boolean,
  parcelas: Number,
  parcela_atual: Number,
  id_grupo_parcelas: String
});

const Transacao = mongoose.model("Transacao", TransacaoSchema);

const CaixinhaSchema = new mongoose.Schema({
  usuario_id: String,
  nome: String,
  valor_total: Number,
  parcelas_total: Number,
  data_inicio: String,
  valor_pago: { type: Number, default: 0 },
  parcelas_pagas: { type: Number, default: 0 }
});

const Caixinha = mongoose.model("Caixinha", CaixinhaSchema);


// --------------------------------------
// 🟢 ROTA DE TESTE
// --------------------------------------
app.get("/", (req, res) => {
  res.send("Backend funcionando com MongoDB 🎉");
});


// --------------------------------------
// 🔐 LOGIN
// --------------------------------------
app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  const usuario = await Usuario.findOne({ email, senha });

  if (!usuario) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos" });
  }

  res.json({ usuario });
});

// --------------------------------------
// 🆕 CADASTRO
// --------------------------------------
app.post("/api/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;

  const existe = await Usuario.findOne({ email });
  if (existe) {
    return res.status(400).json({ erro: "Email já cadastrado" });
  }

  const novo = await Usuario.create({ nome, email, senha });
  res.json({ mensagem: "Cadastrado!", usuario: novo });
});

// --------------------------------------
// 🔍 BUSCAR TRANSAÇÕES
// --------------------------------------
app.get("/api/transacoes/:usuarioId", async (req, res) => {
  const transacoes = await Transacao.find({ usuario_id: req.params.usuarioId })
    .sort({ data: -1 });

  res.json(transacoes);
});

// --------------------------------------
// ➕ ADICIONAR TRANSAÇÃO
// --------------------------------------
app.post("/api/transacoes", async (req, res) => {
  const nova = await Transacao.create(req.body);
  res.json({ mensagem: "Transação adicionada!", id: nova._id });
});

// --------------------------------------
// ✏️ EDITAR TRANSAÇÃO
// --------------------------------------
app.put("/api/transacoes/:id", async (req, res) => {
  await Transacao.findByIdAndUpdate(req.params.id, req.body);
  res.json({ mensagem: "Atualizada!" });
});

// --------------------------------------
// 🗑️ DELETAR
// --------------------------------------
app.delete("/api/transacoes/:id", async (req, res) => {
  await Transacao.findByIdAndDelete(req.params.id);
  res.json({ mensagem: "Deletada!" });
});

// --------------------------------------
// 💳 PARCELADA
// --------------------------------------
app.post("/api/transacoes/parcelada", async (req, res) => {
  const { usuario_id, valor, categoria, tipo, data, descricao, fixo, pago, parcelas } = req.body;

  if (parcelas > 1) {
    const idGrupo = `PARC_${Date.now()}`;
    const valorParcela = (valor / parcelas).toFixed(2);
    const dataInicial = new Date(data);

    const criadas = [];

    for (let i = 1; i <= parcelas; i++) {
      const d = new Date(dataInicial);
      d.setMonth(d.getMonth() + (i - 1));

      const transacao = await Transacao.create({
        usuario_id,
        valor: valorParcela,
        categoria,
        tipo,
        data: d.toISOString().slice(0, 10),
        descricao: `${descricao} (${i}/${parcelas})`,
        fixo,
        pago: false,
        parcelas,
        parcela_atual: i,
        id_grupo_parcelas: idGrupo
      });

      criadas.push(transacao);
    }

    return res.json({ mensagem: "Parcelas criadas!", transacoes: criadas });
  }

  const unica = await Transacao.create(req.body);
  res.json({ id: unica._id });
});

// --------------------------------------
// 🟦 CAIXINHAS - BUSCAR
// --------------------------------------
app.get("/api/caixinhas/:usuarioId", async (req, res) => {
  const lista = await Caixinha.find({ usuario_id: req.params.usuarioId }).sort({ _id: -1 });
  res.json(lista);
});

// --------------------------------------
// 🟦 CAIXINHA - CRIAR
// --------------------------------------
app.post("/api/caixinhas", async (req, res) => {
  const nova = await Caixinha.create(req.body);
  res.json({ id: nova._id, mensagem: "Caixinha criada!" });
});

// --------------------------------------
// 🟦 PAGAR PARCELA
// --------------------------------------
app.put("/api/caixinhas/:id/pagar", async (req, res) => {
  const { valor } = req.body;

  const cx = await Caixinha.findById(req.params.id);
  cx.valor_pago += valor;
  cx.parcelas_pagas += 1;
  await cx.save();

  res.json({ mensagem: "Parcela paga!" });
});

// --------------------------------------
// 🟦 DELETAR
// --------------------------------------
app.delete("/api/caixinhas/:id", async (req, res) => {
  await Caixinha.findByIdAndDelete(req.params.id);
  res.json({ mensagem: "Caixinha deletada!" });
});


// --------------------------------------
// 🚀 INICIAR SERVIDOR
// --------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor rodando na porta " + PORT);
});
