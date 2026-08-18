const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");

const app = express();
const PORT = 3000;

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "Shuvo.8340",
    database: process.env.DB_NAME || "doinik_talash_tv",
    ssl: process.env.DB_HOST
        ? { rejectUnauthorized: false }
        : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.use(express.json());

app.use(
    session({
        secret: "DOINIK_TALASH_TV_ADMIN_SECRET_2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax"
        }
    })
);

async function testDatabase() {
    try {
        const [rows] = await pool.query("SELECT 1 AS ok");

        console.log("MySQL connected successfully!");
        console.log("Database test:", rows);

    } catch (err) {
        console.error("=================================");
        console.error("MySQL connection failed!");
        console.error("Error message:", err.message);
        console.error("Error code:", err.code);
        console.error("Error errno:", err.errno);
        console.error("Error sqlState:", err.sqlState);
        console.error("=================================");
    }
}
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === "admin" &&
        password === "Doinik@2026"
    ) {
        req.session.isAdmin = true;

        return res.json({
            success: true,
            message: "Login successful"
        });
    }

    res.status(401).json({
        success: false,
        message: "Invalid username or password"
    });
});
function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) {
        return res.status(401).json({
            message: "Admin login required"
        });
    }

    next();
}
app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({
                message: "Unable to logout"
            });
        }

        res.json({
            success: true,
            message: "Logged out successfully"
        });
    });
});
app.get("/admin.html", (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect("/admin-login.html");
    }

    res.sendFile(__dirname + "/admin.html");
});

app.get("/admin-login.html", (req, res) => {
    res.sendFile(__dirname + "/admin-login.html");
});

app.use(express.static(__dirname));

app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS ok");
        res.json({
            ok: true,
            database: rows[0].ok === 1
        });
    } catch (err) {
        console.error("Health error:", err.message);
        res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});
app.post("/api/news", requireAdmin, async (req, res) => {
    const { title, category, description, image, content } = req.body;

    if (!title || !category || !description || !image || !content) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO news
            (title, category, description, image, content)
            VALUES (?, ?, ?, ?, ?)`,
            [title, category, description, image, content]
        );

        res.status(201).json({
            message: "News published successfully",
            id: result.insertId
        });

    } catch (err) {
        console.error("Add news failed:", err.message);

        res.status(503).json({
            message: "Unable to publish news",
            error: err.code || "DB_ERROR"
        });
    }
});
app.get("/api/news", async (req, res) => {
    console.log("GET /api/news received");

    try {
        console.log("Running news query...");

        const [rows] = await pool.query(
            "SELECT * FROM news ORDER BY created_at DESC"
        );

        console.log("News rows returned:", rows.length);

        res.json(rows);

    } catch (err) {
        console.error("News query error:", err.message);

        res.status(500).json({
            message: "Unable to load news",
            error: err.message
        });
    }
});

app.get("/api/news/search", async (req, res) => {
    const search = String(req.query.q || "").trim();

    if (!search) {
        return res.json([]);
    }

    const term = `%${search}%`;

    try {
        const [rows] = await pool.query(
            `SELECT * FROM news
             WHERE title LIKE ?
             OR category LIKE ?
             OR description LIKE ?
             OR content LIKE ?
             ORDER BY created_at DESC`,
            [term, term, term, term]
        );

        res.json(rows);

    } catch (err) {
        console.error("Search error:", err.message);

        res.status(500).json({
            message: "Unable to search news",
            error: err.message
        });
    }
});

app.get("/api/news/category/:category", async (req, res) => {
    const category = String(req.params.category || "")
        .trim()
        .toLowerCase();

    try {
        const [rows] = await pool.query(
            "SELECT * FROM news WHERE LOWER(category) = ? ORDER BY created_at DESC",
            [category]
        );

        res.json(rows);

    } catch (err) {
        console.error("Category error:", err.message);

        res.status(500).json({
            message: "Unable to load category news",
            error: err.message
        });
    }
});

app.get("/api/news/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid article ID"
        });
    }

    console.log(`GET /api/news/${id} received`);

    try {
        const [rows] = await pool.query(
            "SELECT * FROM news WHERE id = ? LIMIT 1",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Article not found"
            });
        }

        res.json(rows[0]);

    } catch (err) {
        console.error("Article query error:", err.message);

        res.status(500).json({
            message: "Unable to load article",
            error: err.message
        });
    }
});
app.put("/api/news/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { title, category, description, image, content } = req.body;

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid article ID"
        });
    }

    if (!title || !category || !description || !image || !content) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    try {
        const [result] = await pool.query(
            `UPDATE news
             SET title = ?,
                 category = ?,
                 description = ?,
                 image = ?,
                 content = ?
             WHERE id = ?`,
            [title, category, description, image, content, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Article not found"
            });
        }

        res.json({
            message: "News updated successfully",
            id: id
        });

    } catch (err) {
        console.error("Update news failed:", err.message);

        res.status(500).json({
            message: "Unable to update news",
            error: err.code || "DB_ERROR"
        });
    }
});
app.delete("/api/news/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid article ID"
        });
    }

    try {
        const [result] = await pool.query(
            "DELETE FROM news WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Article not found"
            });
        }

        res.json({
            message: "News deleted successfully",
            id: id
        });

    } catch (err) {
        console.error("Delete news failed:", err.message);

        res.status(500).json({
            message: "Unable to delete news",
            error: err.code || "DB_ERROR"
        });
    }
});
app.listen(PORT, async () => {
    console.log(`DOINIK TALASH TV is running at http://localhost:${PORT}`);
    await testDatabase();
});