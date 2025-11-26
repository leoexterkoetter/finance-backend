import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors({
  origin: '*', // Aceita qualquer origem (vamos configurar depois)
  credentials: true
}));
app.use(express.json());

// Conexão com MySQL
const db = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Sucesso_123",
  database: "finance_app",
});

// Rota de teste
app.get("/", (req, res) => {
  res.send("Backend funcionando");
});

// ROTA DE LOGIN (/api/login)
app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha obrigatórios" });
    }

    const [rows] = await db.execute(
      "SELECT * FROM usuarios WHERE email = ? AND senha = ?",
      [email, senha]
    );

    if (rows.length === 0) {
      return res.status(401).json({ erro: "Usuário ou senha inválidos" });
    }

    res.json({ usuario: rows[0] });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ erro: "Erro interno no servidor" });
  }
});

// ROTA DE CADASTRO (/api/cadastro)
app.post("/api/cadastro", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: "Nome, email e senha obrigatórios" });
    }

    // Verifica se já existe
    const [verificar] = await db.execute(
      "SELECT * FROM usuarios WHERE email = ?",
      [email]
    );

    if (verificar.length > 0) {
      return res.status(400).json({ erro: "Email já cadastrado" });
    }

    // Insere
    await db.execute(
      "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
      [nome, email, senha]
    );

    res.json({ mensagem: "Usuário cadastrado com sucesso!" });
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.status(500).json({ erro: "Erro interno no servidor" });
  }
});
// BUSCAR TRANSAÇÕES DO USUÁRIO
app.get("/api/transacoes/:usuarioId", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY data DESC",
      [req.params.usuarioId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar transações:", err);
    res.status(500).json({ erro: "Erro ao buscar transações" });
  }
});

// ADICIONAR TRANSAÇÃO
app.post("/api/transacoes", async (req, res) => {
  try {
    const { usuario_id, valor, categoria, tipo, data, descricao, fixo, pago } = req.body;

    const [result] = await db.execute(
      `INSERT INTO transacoes (usuario_id, valor, categoria, tipo, data, descricao, fixo, pago) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usuario_id, valor, categoria, tipo, data, descricao, fixo ? 1 : 0, pago ? 1 : 0]
    );

    res.json({ id: result.insertId, mensagem: "Transação adicionada!" });
  } catch (err) {
    console.error("Erro ao adicionar transação:", err);
    res.status(500).json({ erro: "Erro ao adicionar transação" });
  }
});

// ATUALIZAR TRANSAÇÃO
app.put("/api/transacoes/:id", async (req, res) => {
  try {
    const { valor, categoria, tipo, data, descricao, fixo, pago } = req.body;

    await db.execute(
      `UPDATE transacoes SET valor=?, categoria=?, tipo=?, data=?, descricao=?, fixo=?, pago=? 
       WHERE id=?`,
      [valor, categoria, tipo, data, descricao, fixo ? 1 : 0, pago ? 1 : 0, req.params.id]
    );

    res.json({ mensagem: "Transação atualizada!" });
  } catch (err) {
    console.error("Erro ao atualizar:", err);
    res.status(500).json({ erro: "Erro ao atualizar" });
  }
});

// DELETAR TRANSAÇÃO
app.delete("/api/transacoes/:id", async (req, res) => {
  try {
    await db.execute("DELETE FROM transacoes WHERE id = ?", [req.params.id]);
    res.json({ mensagem: "Transação deletada!" });
  } catch (err) {
    console.error("Erro ao deletar:", err);
    res.status(500).json({ erro: "Erro ao deletar" });
  }
});
// ADICIONAR TRANSAÇÃO COM PARCELAS
app.post("/api/transacoes/parcelada", async (req, res) => {
  try {
    const { usuario_id, valor, categoria, tipo, data, descricao, fixo, pago, parcelas } = req.body;

    if (parcelas > 1) {
      // Criar ID único para o grupo de parcelas
      const idGrupo = `PARC_${Date.now()}`;
      const valorParcela = (valor / parcelas).toFixed(2);
      const dataInicial = new Date(data);

      const transacoes = [];
      
      for (let i = 1; i <= parcelas; i++) {
        // Calcula a data de cada parcela (mês a mês)
        const dataParcela = new Date(dataInicial);
        dataParcela.setMonth(dataParcela.getMonth() + (i - 1));
        
        const [result] = await db.execute(
          `INSERT INTO transacoes (usuario_id, valor, categoria, tipo, data, descricao, fixo, pago, parcelas, parcela_atual, id_grupo_parcelas) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [usuario_id, valorParcela, categoria, tipo, dataParcela.toISOString().slice(0, 10), 
           `${descricao} (${i}/${parcelas})`, fixo ? 1 : 0, false, parcelas, i, idGrupo]
        );
        
        transacoes.push({ id: result.insertId, parcela: i });
      }

      res.json({ mensagem: `${parcelas} parcelas criadas!`, transacoes });
    } else {
      // Se não tem parcelas, cria transação normal
      const [result] = await db.execute(
        `INSERT INTO transacoes (usuario_id, valor, categoria, tipo, data, descricao, fixo, pago) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [usuario_id, valor, categoria, tipo, data, descricao, fixo ? 1 : 0, pago ? 1 : 0]
      );
      
      res.json({ id: result.insertId });
    }
  } catch (err) {
    console.error("Erro ao criar parcelas:", err);
    res.status(500).json({ erro: "Erro ao criar parcelas" });
  }
});
// CAIXINHAS - CRUD completo
app.get("/api/caixinhas/:usuarioId", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM caixinhas WHERE usuario_id = ? ORDER BY id DESC",
      [req.params.usuarioId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/api/caixinhas", async (req, res) => {
  try {
    const { usuario_id, nome, valor_total, parcelas_total, data_inicio } = req.body;
    
    const [result] = await db.execute(
      "INSERT INTO caixinhas (usuario_id, nome, valor_total, parcelas_total, data_inicio) VALUES (?, ?, ?, ?, ?)",
      [usuario_id, nome, valor_total, parcelas_total, data_inicio]
    );
    
    res.json({ id: result.insertId, mensagem: "Caixinha criada!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/api/caixinhas/:id/pagar", async (req, res) => {
  try {
    const { valor } = req.body;
    
    await db.execute(
      "UPDATE caixinhas SET valor_pago = valor_pago + ?, parcelas_pagas = parcelas_pagas + 1 WHERE id = ?",
      [valor, req.params.id]
    );
    
    res.json({ mensagem: "Parcela paga!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/api/caixinhas/:id", async (req, res) => {
  try {
    await db.execute("DELETE FROM caixinhas WHERE id = ?", [req.params.id]);
    res.json({ mensagem: "Caixinha deletada!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3307;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
