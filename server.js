const express = require("express");
const mysql = require("mysql2/promise");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const BENGALI_FONT = path.join(
    __dirname,
    "SolaimanLipi_Bold_10-03-12.ttf"
);
const http = require("http");
const https = require("https");
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage: storage });
const PORT = 3000;
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

function downloadImage(url) {
    return new Promise((resolve, reject) => {
        if (!url) {
            resolve(null);
            return;
        }

        const client = url.startsWith("https") ? https : http;

        client.get(url, response => {

            if (
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
            ) {
                downloadImage(response.headers.location)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(
                    new Error(`Image download failed: ${response.statusCode}`)
                );
                return;
            }

            const chunks = [];

            response.on("data", chunk => {
                chunks.push(chunk);
            });

            response.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            response.on("error", reject);

        }).on("error", reject);
    });
}
function getArticleImage(imagePath) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!imagePath) {
                resolve(null);
                return;
            }

            // Local uploaded image
            if (imagePath.startsWith("/uploads/")) {
                const filePath = path.join(
                    uploadDir,
                    imagePath.replace("/uploads/", "")
                );

                if (!fs.existsSync(filePath)) {
                    console.log("Local image not found:", filePath);
                    resolve(null);
                    return;
                }

                resolve(fs.readFileSync(filePath));
                return;
            }

            // Online image
            if (
                imagePath.startsWith("http://") ||
                imagePath.startsWith("https://")
            ) {
                const buffer = await downloadImage(imagePath);
                resolve(buffer);
                return;
            }

            resolve(null);

        } catch (error) {
            console.log("Image loading error:", error.message);
            resolve(null);
        }
    });
}

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
    if (!req.session || !req.session.isAdmin) {
        return res.status(401).json({
            message: "Admin login required"
        });
    }

    next();
}

function requireAdminOrVolunteer(req, res, next) {
    if (
        !req.session ||
        (!req.session.isAdmin && !req.session.isVolunteer)
    ) {
        return res.status(401).json({
            message: "Admin or volunteer login required"
        });
    }

    next();
}
function requireVolunteer(req, res, next) {
    if (!req.session || !req.session.isVolunteer) {
        return res.status(401).json({
            message: "Volunteer login required"
        });
    }

    next();
}

app.use("/uploads", express.static(uploadDir));
app.post(
    "/api/upload-image",
    requireAdminOrVolunteer,
    upload.single("image"),
    (req, res) => {

    if (!req.file) {
        return res.status(400).json({
            message: "No image selected"
        });
    }

    res.json({
        success: true,
        image: `/uploads/${req.file.filename}`
    });
});
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
app.post("/api/volunteer/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === "volunteer" &&
        password === "Volunteer@2026"
    ) {
        req.session.isVolunteer = true;

        return res.json({
            success: true,
            message: "Volunteer login successful"
        });
    }

    res.status(401).json({
        success: false,
        message: "Invalid username or password"
    });
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
app.post("/api/volunteer/news", requireVolunteer, async (req, res) => {
    const {
        title,
        category,
        description,
        image,
        content
    } = req.body;

    if (
        !title ||
        !category ||
        !description ||
        !image ||
        !content
    ) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO news
            (title, category, description, image, content)
            VALUES (?, ?, ?, ?, ?)`,
            [
                title,
                category,
                description,
                image,
                content
            ]
        );

        res.status(201).json({
            success: true,
            message: "News published successfully",
            id: result.insertId
        });

    } catch (err) {
        console.error(
            "Volunteer news submission failed:",
            err.message
        );

        res.status(503).json({
            success: false,
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

app.put("/api/news/:id", requireAdmin, async (req, res) => {
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
app.delete("/api/news/:id", requireAdmin, async (req, res) => {
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
app.get("/epaper", async (req, res) => {

    try {

        const [rows] = await pool.query(
            `
            SELECT id
            FROM news
            ORDER BY created_at DESC
            LIMIT 1
            `
        );

        if (rows.length === 0) {
            return res.status(404).send("কোনো ই-পেপার পাওয়া যায়নি");
        }

        res.redirect("/epaper/" + rows[0].id);

    } catch (err) {

        console.error(
            "ই-পেপার হোম রুটে সমস্যা:",
            err
        );

        res.status(500).send(
            "ই-পেপার লোড করা সম্ভব হয়নি"
        );
    }

});
// =========================================================
// DOINIK TALASH TV — E-PAPER VIEWER
// MOBILE FIRST
// PAGE 1 = LATEST ARTICLE
// NO PROMOTIONAL SECTIONS
// NO PRINT SYSTEM
// =========================================================

app.get("/epaper/:id", async (req, res) => {

    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).send("অবৈধ সংবাদ আইডি");
    }

    try {

        // =====================================================
        // CURRENT ARTICLE
        // =====================================================

        const [rows] = await pool.query(
            "SELECT * FROM news WHERE id = ? LIMIT 1",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).send("সংবাদটি পাওয়া যায়নি");
        }

        const article = rows[0];

        // =====================================================
        // ALL PAGES
        // LATEST ARTICLE = PAGE 1
        // =====================================================

        const [pageRows] = await pool.query(
            `
            SELECT
                id,
                title,
                created_at
            FROM news
            ORDER BY created_at DESC
            `
        );

        const currentIndex = pageRows.findIndex(
            row => Number(row.id) === id
        );

        const pageIndex =
            currentIndex >= 0
                ? currentIndex + 1
                : 1;

        const totalPages = pageRows.length;

        // =====================================================
        // PREVIOUS / NEXT
        // =====================================================

        const previousId =
            currentIndex > 0
                ? pageRows[currentIndex - 1].id
                : null;

        const nextId =
            currentIndex >= 0 &&
            currentIndex < pageRows.length - 1
                ? pageRows[currentIndex + 1].id
                : null;

        // =====================================================
        // HTML ESCAPE
        // =====================================================

        const escapeHtml = value => {
            return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // =====================================================
        // ARTICLE DATA
        // =====================================================

        const title = escapeHtml(
            article.title || "সংবাদ"
        );

        const category = escapeHtml(
            String(
                article.category || "সংবাদ"
            ).toUpperCase()
        );

        const description = escapeHtml(
            article.description || ""
        );

        const content = escapeHtml(
            article.content || ""
        );

        const dateText = article.created_at
            ? new Date(
                article.created_at
            ).toLocaleDateString(
                "bn-BD",
                {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }
            )
            : "";

        // =====================================================
        // LOGO
        // =====================================================

        const logoPath = path.join(
            __dirname,
            "logo.jpg"
        );

        let logoData = "";

        if (fs.existsSync(logoPath)) {

            const logoBuffer = fs.readFileSync(
                logoPath
            );

            logoData =
                "data:image/jpeg;base64," +
                logoBuffer.toString("base64");
        }

        // =====================================================
        // PAGE BUTTONS
        // =====================================================

        const pageButtons = pageRows
            .map((page, index) => {

                const active =
                    Number(page.id) === id
                        ? "active"
                        : "";

                return `
                    <button
                        class="page-button ${active}"
                        data-id="${page.id}"
                        type="button"
                    >
                        ${index + 1}
                    </button>
                `;

            })
            .join("");

        // =====================================================
        // HTML
        // =====================================================

        res.send(`

<!DOCTYPE html>

<html lang="bn">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>
    ${title} | দৈনিক তালাশ টিভি
</title>

<style>

/* =====================================================
   RESET
   ===================================================== */

* {
    box-sizing: border-box;
}

html,
body {

    margin: 0;
    padding: 0;

    width: 100%;
    min-height: 100%;

    background: #eeeeee;

    font-family:
        Arial,
        Helvetica,
        sans-serif;
}

button {
    font-family: inherit;
}

/* =====================================================
   MAIN VIEWER
   ===================================================== */

.epaper-viewer {

    width: 100%;

    min-height: 100vh;

    background: #eeeeee;
}

/* =====================================================
   TOP HEADER
   ===================================================== */

.viewer-header {

    width: 100%;

    background: #ffffff;

    border-bottom: 1px solid #d8d8d8;

    position: sticky;

    top: 0;

    z-index: 1000;
}

/* =====================================================
   LOGO ROW
   ===================================================== */

.logo-row {

    height: 54px;

    display: flex;

    align-items: center;

    justify-content: space-between;

    padding: 5px 10px;

    background: #ffffff;
}

.logo {

    display: block;

    width: auto;

    height: 40px;

    max-width: 170px;

    object-fit: contain;
}

.header-icons {

    display: flex;

    align-items: center;

    gap: 5px;
}

.icon-button {

    width: 34px;

    height: 34px;

    border: 0;

    border-radius: 50%;

    background: #f2f2f2;

    color: #222;

    font-size: 16px;

    cursor: pointer;

    display: flex;

    align-items: center;

    justify-content: center;
}

/* =====================================================
   CATEGORY NAVIGATION
   ===================================================== */

.category-navigation {

    width: 100%;

    display: flex;

    align-items: center;

    gap: 0;

    overflow-x: auto;

    white-space: nowrap;

    border-top: 1px solid #eeeeee;

    border-bottom: 1px solid #dddddd;

    scrollbar-width: none;

    background: #ffffff;
}

.category-navigation::-webkit-scrollbar {
    display: none;
}

.category-navigation a {

    flex: 0 0 auto;

    padding: 8px 11px;

    color: #111;

    text-decoration: none;

    font-size: 13px;

    font-weight: 700;
}

.category-navigation a:first-child {

    padding-left: 12px;
}

.category-navigation a:hover {

    color: #d00000;
}

/* =====================================================
   E-PAPER CONTROLS
   ===================================================== */

.epaper-controls {

    width: 100%;

    display: flex;

    align-items: center;

    gap: 5px;

    padding: 6px 8px;

    overflow-x: auto;

    scrollbar-width: none;

    background: #ffffff;
}

.epaper-controls::-webkit-scrollbar {
    display: none;
}

.control-button {

    flex: 0 0 auto;

    min-height: 32px;

    padding: 6px 9px;

    border: 1px solid #d5d5d5;

    border-radius: 5px;

    background: #ffffff;

    color: #222;

    font-size: 11px;

    font-weight: 700;

    cursor: pointer;

    white-space: nowrap;
}

.control-button.active {

    background: #d00000;

    border-color: #d00000;

    color: #ffffff;
}

/* =====================================================
   DATE / EDITION ROW
   ===================================================== */

.edition-row {

    width: 100%;

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 8px;

    padding: 6px 9px;

    background: #f8f8f8;

    border-top: 1px solid #eeeeee;

    border-bottom: 1px solid #dddddd;
}

.edition-item {

    display: flex;

    align-items: center;

    gap: 4px;

    font-size: 12px;

    font-weight: 700;

    color: #222;

    white-space: nowrap;
}

.edition-icon {

    font-size: 13px;
}

/* =====================================================
   PAGE NUMBERS
   ===================================================== */

.page-navigation {

    width: 100%;

    display: flex;

    align-items: center;

    gap: 4px;

    padding: 6px 8px;

    background: #ffffff;

    overflow-x: auto;

    scrollbar-width: none;
}

.page-navigation::-webkit-scrollbar {
    display: none;
}

.page-button {

    flex: 0 0 auto;

    width: 30px;

    height: 30px;

    border: 1px solid #cfcfcf;

    border-radius: 4px;

    background: #ffffff;

    color: #222;

    font-size: 12px;

    font-weight: 700;

    cursor: pointer;
}

.page-button.active {

    background: #d00000;

    border-color: #d00000;

    color: #ffffff;
}

/* =====================================================
   PAPER CONTAINER
   ===================================================== */

.paper-area {

    position: relative;

    width: 100%;

    padding: 10px 8px 25px;

    background: #eeeeee;

    display: flex;

    justify-content: center;

    align-items: flex-start;
}

/* =====================================================
   PAPER FRAME
   ===================================================== */

.paper-frame {

    position: relative;

    width: 100%;

    max-width: 1080px;

    margin-top: 12px;

    background: #ffffff;

    border: 1px solid #cccccc;

    border-radius: 4px;

    box-shadow:
        0 1px 5px rgba(0,0,0,0.20);

    overflow: hidden;
}

/* =====================================================
   NEWSPAPER PAGE
   ===================================================== */

.paper-image {

    display: block;

    width: 100%;

    height: auto;

    margin: 0;

    user-select: none;

    -webkit-user-drag: none;
}

/* =====================================================
   LEFT / RIGHT PAGE ARROWS
   ===================================================== */

.page-arrow {

    position: absolute;

    top: 50%;

    transform: translateY(-50%);

    z-index: 20;

    width: 36px;

    height: 52px;

    border: 0;

    background: #d00000;

    color: #ffffff;

    font-size: 28px;

    line-height: 1;

    cursor: pointer;

    display: flex;

    align-items: center;

    justify-content: center;
}

.page-arrow.left {

    left: 0;

    border-radius:
        0 4px 4px 0;
}

.page-arrow.right {

    right: 0;

    border-radius:
        4px 0 0 4px;
}

.page-arrow:disabled {

    opacity: 0.25;

    cursor: default;
}

/* =====================================================
   TEXT VIEW
   ===================================================== */

.text-view {

    display: none;

    width: 100%;

    max-width: 1080px;

    margin: 0 auto;

    padding: 24px 18px 40px;

    background: #ffffff;

    min-height: 70vh;
}

.text-category {

    margin-bottom: 8px;

    color: #d00000;

    font-size: 13px;

    font-weight: 700;
}

.text-view h1 {

    margin: 0 0 9px;

    font-size: 27px;

    line-height: 1.3;

    color: #111;
}

.text-date {

    margin-bottom: 18px;

    color: #777;

    font-size: 13px;
}

.text-description {

    margin-bottom: 18px;

    font-size: 17px;

    line-height: 1.7;

    font-weight: 700;

    color: #222;
}

.text-content {

    font-size: 16px;

    line-height: 1.8;

    white-space: pre-wrap;

    color: #222;
}

/* =====================================================
   FULL PAGE MODE
   ===================================================== */

.full-page-mode .viewer-header {

    display: none;
}

.full-page-mode .paper-area {

    padding: 0;

    background: #000;

    min-height: 100vh;
}

.full-page-mode .paper-frame {

    max-width: 1080px;

    border: 0;

    border-radius: 0;

    box-shadow: none;
}

/* =====================================================
   DESKTOP
   ===================================================== */

@media (min-width: 601px) {

    .viewer-header {

        max-width: 1080px;

        margin: 0 auto;
    }

    .paper-area {

        padding-top: 12px;
    }

    .category-navigation a {

        font-size: 14px;

        padding:
            8px 14px;
    }

    .paper-frame {

        max-width: 1080px;
    }
}

/* =====================================================
   MOBILE
   ===================================================== */

@media (max-width: 600px) {

    .logo-row {

        height: 48px;

        padding:
            4px 8px;
    }

    .logo {

        height: 35px;

        max-width: 150px;
    }

    .icon-button {

        width: 31px;

        height: 31px;

        font-size: 14px;
    }

    .category-navigation a {

        padding:
            7px 9px;

        font-size: 12px;
    }

    .epaper-controls {

        padding:
            5px 6px;
    }

    .control-button {

        min-height: 30px;

        padding:
            5px 8px;

        font-size: 10px;
    }

    .edition-row {

        padding:
            6px 8px;
    }

    .edition-item {

        font-size: 11px;
    }

    .page-navigation {

        padding:
            5px 6px;
    }

    .page-button {

        width: 29px;

        height: 29px;
    }

    .paper-area {

        padding:
            6px 4px 20px;
    }

    .paper-frame {

        width: 100%;

        border-radius: 2px;
    }

    .page-arrow {

        width: 31px;

        height: 45px;

        font-size: 24px;
    }

    .text-view {

        padding:
            20px 14px 35px;
    }

    .text-view h1 {

        font-size: 23px;
    }

    .text-description {

        font-size: 16px;
    }

    .text-content {

        font-size: 15px;

        line-height: 1.75;
    }
}

</style>

</head>

<body>

<div
    class="epaper-viewer"
    id="epaper-viewer"
>

    <!-- =================================================
         HEADER
         ================================================= -->

    <header class="viewer-header">

        <!-- LOGO -->

        <div class="logo-row">

            ${
                logoData
                    ? `
                        <img
                            class="logo"
                            src="${logoData}"
                            alt="দৈনিক তালাশ টিভি"
                        >
                    `
                    : `
                        <strong>
                            দৈনিক তালাশ টিভি
                        </strong>
                    `
            }

            <div class="header-icons">

                <button
                    id="home-button"
                    class="icon-button"
                    type="button"
                    aria-label="হোম"
                >
                    ⌂
                </button>

                <button
                    id="menu-button"
                    class="icon-button"
                    type="button"
                    aria-label="মেনু"
                >
                    ☰
                </button>

            </div>

        </div>


        <!-- CATEGORY NAVIGATION -->

        <nav
            class="category-navigation"
            id="category-navigation"
        >

            <a href="/">
                হোম
            </a>

            <a href="/category.html?category=national">
                জাতীয়
            </a>

            <a href="/category.html?category=politics">
                রাজনীতি
            </a>

            <a href="/category.html?category=world">
                বিশ্ব
            </a>

            <a href="/category.html?category=sports">
                খেলা
            </a>

            <a href="/category.html?category=business">
                ব্যবসা
            </a>

            <a href="/category.html?category=technology">
                প্রযুক্তি
            </a>

            <a href="/category.html?category=entertainment">
                বিনোদন
            </a>

        </nav>


        <!-- E-PAPER CONTROLS -->

        <div class="epaper-controls">

            <button
                id="image-view-button"
                class="control-button active"
                type="button"
            >
                🖼 ছবি
            </button>

            <button
                id="text-view-button"
                class="control-button"
                type="button"
            >
                📝 লেখা
            </button>

            <button
                id="full-page-button"
                class="control-button"
                type="button"
            >
                ⛶ পূর্ণ পৃষ্ঠা
            </button>

            <button
                id="share-button"
                class="control-button"
                type="button"
            >
                ↗ শেয়ার
            </button>

            <button
                id="download-button"
                class="control-button"
                type="button"
            >
                ↓ ডাউনলোড
            </button>

            <button
                id="close-button"
                class="control-button"
                type="button"
            >
                × বন্ধ
            </button>

        </div>


        <!-- DATE / PAGE -->

        <div class="edition-row">

            <div class="edition-item">

                <span class="edition-icon">
                    📅
                </span>

                <span>
                    ${escapeHtml(dateText)}
                </span>

            </div>

            <div class="edition-item">

                পৃষ্ঠা ${pageIndex} / ${totalPages}

            </div>

        </div>


        <!-- PAGE NUMBERS -->

        <div class="page-navigation">

            ${pageButtons}

        </div>

    </header>


    <!-- =================================================
         PAPER
         ================================================= -->

    <main class="paper-area">

        <section
            class="paper-frame"
            id="paper-frame"
        >

            <!-- LEFT ARROW -->

            <button
                id="previous-button"
                class="page-arrow left"
                type="button"
                ${previousId === null ? "disabled" : ""}
                aria-label="আগের পৃষ্ঠা"
            >
                ‹
            </button>


            <!-- COMPLETE E-PAPER PAGE -->

            <div
                id="image-view"
            >

                <img
                    class="paper-image"
                    src="/api/news/${id}/epaper-image"
                    alt="${title}"
                    draggable="false"
                >

            </div>


            <!-- TEXT VIEW -->

            <article
                id="text-view"
                class="text-view"
            >

                <div class="text-category">
                    ${category}
                </div>

                <h1>
                    ${title}
                </h1>

                <div class="text-date">
                    ${escapeHtml(dateText)}
                    · দৈনিক তালাশ টিভি
                </div>

                <div class="text-description">
                    ${description}
                </div>

                <div class="text-content">
                    ${content}
                </div>

            </article>


            <!-- RIGHT ARROW -->

            <button
                id="next-button"
                class="page-arrow right"
                type="button"
                ${nextId === null ? "disabled" : ""}
                aria-label="পরের পৃষ্ঠা"
            >
                ›
            </button>

        </section>

    </main>

</div>


<script>

/* =====================================================
   ELEMENTS
   ===================================================== */

const viewer =
    document.getElementById(
        "epaper-viewer"
    );

const imageView =
    document.getElementById(
        "image-view"
    );

const textView =
    document.getElementById(
        "text-view"
    );

const imageViewButton =
    document.getElementById(
        "image-view-button"
    );

const textViewButton =
    document.getElementById(
        "text-view-button"
    );

const fullPageButton =
    document.getElementById(
        "full-page-button"
    );

const shareButton =
    document.getElementById(
        "share-button"
    );

const downloadButton =
    document.getElementById(
        "download-button"
    );

const closeButton =
    document.getElementById(
        "close-button"
    );

const homeButton =
    document.getElementById(
        "home-button"
    );

const menuButton =
    document.getElementById(
        "menu-button"
    );

const previousButton =
    document.getElementById(
        "previous-button"
    );

const nextButton =
    document.getElementById(
        "next-button"
    );

const pageButtons =
    document.querySelectorAll(
        ".page-button"
    );


/* =====================================================
   IMAGE VIEW
   ===================================================== */

imageViewButton.addEventListener(
    "click",
    () => {

        imageView.style.display =
            "block";

        textView.style.display =
            "none";

        imageViewButton.classList.add(
            "active"
        );

        textViewButton.classList.remove(
            "active"
        );

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
);


/* =====================================================
   TEXT VIEW
   ===================================================== */

textViewButton.addEventListener(
    "click",
    () => {

        imageView.style.display =
            "none";

        textView.style.display =
            "block";

        textViewButton.classList.add(
            "active"
        );

        imageViewButton.classList.remove(
            "active"
        );

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
);


/* =====================================================
   FULL PAGE
   ===================================================== */

fullPageButton.addEventListener(
    "click",
    () => {

        viewer.classList.toggle(
            "full-page-mode"
        );

        fullPageButton.classList.toggle(
            "active"
        );

    }
);


/* =====================================================
   HOME
   ===================================================== */

homeButton.addEventListener(
    "click",
    () => {

        window.location.href = "/";
    }
);


/* =====================================================
   MENU
   ===================================================== */

menuButton.addEventListener(
    "click",
    () => {

        const nav =
            document.getElementById(
                "category-navigation"
            );

        if (
            nav.style.display === "none"
        ) {

            nav.style.display =
                "flex";

        } else {

            nav.style.display =
                "none";
        }
    }
);


/* =====================================================
   SHARE
   ===================================================== */

shareButton.addEventListener(
    "click",
    async () => {

        const shareData = {

            title:
                "${title}",

            text:
                "দৈনিক তালাশ টিভি ই-পেপার",

            url:
                window.location.href
        };

        try {

            if (
                navigator.share
            ) {

                await navigator.share(
                    shareData
                );

            } else if (
                navigator.clipboard
            ) {

                await navigator.clipboard.writeText(
                    window.location.href
                );

                alert(
                    "ই-পেপারের লিংক কপি হয়েছে।"
                );

            } else {

                alert(
                    window.location.href
                );
            }

        } catch (error) {

            if (
                error.name !==
                "AbortError"
            ) {

                console.error(
                    "শেয়ার করতে সমস্যা:",
                    error
                );
            }
        }
    }
);


/* =====================================================
   DOWNLOAD COMPLETE PAGE
   ===================================================== */

downloadButton.addEventListener(
    "click",
    async () => {

        const imageUrl =
            "/api/news/${id}/epaper-image";

        try {

            const response =
                await fetch(
                    imageUrl
                );

            if (!response.ok) {

                throw new Error(
                    "ডাউনলোড ব্যর্থ হয়েছে"
                );
            }

            const blob =
                await response.blob();

            const blobUrl =
                URL.createObjectURL(
                    blob
                );

            const link =
                document.createElement(
                    "a"
                );

            link.href =
                blobUrl;

            link.download =
                "DOINIK_TALASH_TV_PAGE_${pageIndex}.jpg";

            document.body.appendChild(
                link
            );

            link.click();

            link.remove();

            setTimeout(
                () => {
                    URL.revokeObjectURL(
                        blobUrl
                    );
                },
                1000
            );

        } catch (error) {

            console.error(
                "ডাউনলোড করতে সমস্যা:",
                error
            );

            alert(
                "ই-পেপার পৃষ্ঠা ডাউনলোড করা সম্ভব হয়নি।"
            );
        }
    }
);


/* =====================================================
   CLOSE
   ===================================================== */

closeButton.addEventListener(
    "click",
    () => {

        if (
            window.history.length > 1
        ) {

            window.history.back();

        } else {

            window.location.href =
                "/";
        }
    }
);


/* =====================================================
   PREVIOUS
   ===================================================== */

if (${previousId !== null}) {

    previousButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "/epaper/${previousId}";
        }
    );
}


/* =====================================================
   NEXT
   ===================================================== */

if (${nextId !== null}) {

    nextButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "/epaper/${nextId}";
        }
    );
}


/* =====================================================
   PAGE NUMBERS
   ===================================================== */

pageButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            () => {

                const selectedId =
                    button.dataset.id;

                if (!selectedId) {
                    return;
                }

                window.location.href =
                    "/epaper/" +
                    selectedId;
            }
        );
    }
);


/* =====================================================
   KEYBOARD
   ===================================================== */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "ArrowLeft" &&
            ${previousId !== null}
        ) {

            window.location.href =
                "/epaper/${previousId}";
        }

        if (
            event.key === "ArrowRight" &&
            ${nextId !== null}
        ) {

            window.location.href =
                "/epaper/${nextId}";
        }
    }
);


/* =====================================================
   MOBILE SWIPE
   ===================================================== */

let touchStartX = 0;
let touchStartY = 0;

document.addEventListener(
    "touchstart",
    event => {

        if (
            event.touches.length !== 1
        ) {
            return;
        }

        touchStartX =
            event.touches[0].clientX;

        touchStartY =
            event.touches[0].clientY;

    },
    {
        passive: true
    }
);


document.addEventListener(
    "touchend",
    event => {

        if (
            event.changedTouches.length !== 1
        ) {
            return;
        }

        const touchEndX =
            event.changedTouches[0].clientX;

        const touchEndY =
            event.changedTouches[0].clientY;

        const deltaX =
            touchEndX -
            touchStartX;

        const deltaY =
            touchEndY -
            touchStartY;

        if (
            Math.abs(deltaX) < 70 ||
            Math.abs(deltaX) <
            Math.abs(deltaY)
        ) {
            return;
        }

        if (
            deltaX < 0 &&
            ${nextId !== null}
        ) {

            window.location.href =
                "/epaper/${nextId}";
        }

        if (
            deltaX > 0 &&
            ${previousId !== null}
        ) {

            window.location.href =
                "/epaper/${previousId}";
        }

    },
    {
        passive: true
    }
);

</script>

</body>

</html>

        `);

    } catch (err) {

        console.error(
            "ই-পেপার রুটে সমস্যা:",
            err
        );

        res.status(500).send(
            "ই-পেপার লোড করা সম্ভব হয়নি"
        );
    }
});
// ============================================================
// E-PAPER IMAGE
// HTML + CSS + AUTOMATIC ARTICLE FONT SIZE
// ============================================================
app.get("/api/news/:id/epaper-image", async (req, res) => {
    let browser;

    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                error: "Invalid news ID"
            });
        }

        console.log(`GET /api/news/${id}/epaper-image received`);

        // --------------------------------------------------------
        // GET ARTICLE
        // --------------------------------------------------------
        const [rows] = await pool.query(
            "SELECT * FROM news WHERE id = ? LIMIT 1",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "News article not found"
            });
        }

        const article = rows[0];

        // --------------------------------------------------------
        // HTML ESCAPE
        // --------------------------------------------------------
        const escapeHtml = (value) => {
            return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // --------------------------------------------------------
        // TITLE
        // --------------------------------------------------------
        const title = String(article.title || "").trim();

        // --------------------------------------------------------
        // CLEAN ARTICLE CONTENT
        // --------------------------------------------------------
        const content = String(article.content || "")
            .replace(/তালাশ\s*টিভি\s*প্রতিবেদন/g, "")
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        // --------------------------------------------------------
        // ARTICLE PARAGRAPHS
        // --------------------------------------------------------
        const contentHtml = content
            .split(/\r?\n\s*\r?\n/)
            .filter(paragraph => paragraph.trim())
            .map(paragraph => {
                return `
                    <p>
                        ${escapeHtml(paragraph.trim())
                            .replace(/\n/g, "<br>")}
                    </p>
                `;
            })
            .join("");

        // --------------------------------------------------------
        // FILE -> DATA URI
        // --------------------------------------------------------
        const fileToDataUri = (filePath, mimeType) => {
            if (!filePath || !fs.existsSync(filePath)) {
                return "";
            }

            const data = fs
                .readFileSync(filePath)
                .toString("base64");

            return `data:${mimeType};base64,${data}`;
        };

        // --------------------------------------------------------
        // LOGO
        // --------------------------------------------------------
        const logoPath = path.join(
            __dirname,
            "logo2.jpg"
        );

        const logoData = fileToDataUri(
            logoPath,
            "image/jpeg"
        );

        // --------------------------------------------------------
        // ARTICLE IMAGE
        // --------------------------------------------------------
        const imageName = article.image
            ? path.basename(String(article.image))
            : "";

        const imagePath = imageName
            ? path.join(__dirname, "uploads", imageName)
            : null;

        const articleImageData = fileToDataUri(
            imagePath,
            "image/jpeg"
        );

        // --------------------------------------------------------
        // NIKOSH FONT
        // --------------------------------------------------------
        const nikoshPath = path.join(
            __dirname,
            "Nikosh.ttf"
        );

        if (!fs.existsSync(nikoshPath)) {
            return res.status(500).json({
                error: "Nikosh.ttf not found"
            });
        }

        const nikoshBase64 = fs
            .readFileSync(nikoshPath)
            .toString("base64");

        // --------------------------------------------------------
        // EPAPER CSS
        // --------------------------------------------------------
        const cssPath = path.join(
            __dirname,
            "epaper.css"
        );

        if (!fs.existsSync(cssPath)) {
            return res.status(500).json({
                error: "epaper.css not found"
            });
        }

        const epaperCss = fs.readFileSync(
            cssPath,
            "utf8"
        );

      // --------------------------------------------------------
// DATE FORMATTING
// --------------------------------------------------------

const toBanglaNumber = (value) => {
    return String(value).replace(/\d/g, digit =>
        "০১২৩৪৫৬৭৮৯"[digit]
    );
};

const banglaMonths = [
    "বৈশাখ",
    "জ্যৈষ্ঠ",
    "আষাঢ়",
    "শ্রাবণ",
    "ভাদ্র",
    "আশ্বিন",
    "কার্তিক",
    "অগ্রহায়ণ",
    "পৌষ",
    "মাঘ",
    "ফাল্গুন",
    "চৈত্র"
];

const hijriMonths = {
    "Muharram": "মহররম",
    "Safar": "সফর",
    "Rabiʻ I": "রবিউল আউয়াল",
    "Rabiʻ II": "রবিউস সানি",
    "Jumada I": "জমাদিউল আউয়াল",
    "Jumada II": "জমাদিউস সানি",
    "Rajab": "রজব",
    "Shaʻban": "শাবান",
    "Ramadan": "রমজান",
    "Shawwal": "শাওয়াল",
    "Dhuʻl-Qiʻdah": "জিলকদ",
    "Dhuʻl-Hijjah": "জিলহজ"
};

const getDateParts = (dateValue) => {

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
        return "";
    }

    // ---------------------------------------------
    // Gregorian date
    // ---------------------------------------------

    const gregorianDay = new Intl.DateTimeFormat(
        "bn-BD",
        {
            day: "numeric",
            timeZone: "Asia/Dhaka"
        }
    ).format(date);

    const gregorianMonth = new Intl.DateTimeFormat(
        "bn-BD",
        {
            month: "long",
            timeZone: "Asia/Dhaka"
        }
    ).format(date);

    const gregorianYear = new Intl.DateTimeFormat(
        "bn-BD",
        {
            year: "numeric",
            timeZone: "Asia/Dhaka"
        }
    ).format(date);

    // ---------------------------------------------
    // Bangla calendar
    // Bangladesh Bangla calendar:
    // 14 April = 1 Boishakh
    // ---------------------------------------------

    const dhakaDate = new Date(
        new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Dhaka",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(date) + "T00:00:00"
    );

    const year = dhakaDate.getFullYear();
    const month = dhakaDate.getMonth();
    const day = dhakaDate.getDate();

    let banglaYear;
    let banglaDay;
    let banglaMonthIndex;

    const banglaYearStart = new Date(year, 3, 14);

    if (dhakaDate >= banglaYearStart) {
        banglaYear = year - 593;
        banglaMonthIndex = 0;
        banglaDay = 1;

        let remainingDays =
            Math.floor(
                (dhakaDate - banglaYearStart) /
                (1000 * 60 * 60 * 24)
            );

        const monthLengths = [
            31, 31, 31, 31, 31,
            30, 30, 30, 30, 30,
            29, 30
        ];

        if (
            banglaYear % 4 === 0
        ) {
            monthLengths[10] = 30;
        }

        while (
            remainingDays >= monthLengths[banglaMonthIndex]
        ) {
            remainingDays -=
                monthLengths[banglaMonthIndex];

            banglaMonthIndex++;
        }

        banglaDay = remainingDays + 1;

    } else {

        banglaYear = year - 594;

        const previousYearStart =
            new Date(year - 1, 3, 14);

        let remainingDays =
            Math.floor(
                (dhakaDate - previousYearStart) /
                (1000 * 60 * 60 * 24)
            );

        const monthLengths = [
            31, 31, 31, 31, 31,
            30, 30, 30, 30, 30,
            29, 30
        ];

        if (
            banglaYear % 4 === 0
        ) {
            monthLengths[10] = 30;
        }

        banglaMonthIndex = 0;

        while (
            remainingDays >= monthLengths[banglaMonthIndex]
        ) {
            remainingDays -=
                monthLengths[banglaMonthIndex];

            banglaMonthIndex++;
        }

        banglaDay = remainingDays + 1;
    }

    // ---------------------------------------------
    // Hijri date
    // ---------------------------------------------

    const hijriFormatter = new Intl.DateTimeFormat(
        "en-US-u-ca-islamic-umalqura",
        {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Dhaka"
        }
    );

    const hijriParts =
        hijriFormatter.formatToParts(date);

    const hijriDay =
        hijriParts.find(
            part => part.type === "day"
        )?.value || "";

    const hijriMonth =
        hijriParts.find(
            part => part.type === "month"
        )?.value || "";

    const hijriYear =
        hijriParts.find(
            part => part.type === "year"
        )?.value || "";

    const hijriMonthBangla =
        hijriMonths[hijriMonth] || hijriMonth;

    return {
        gregorian:
            `${gregorianDay} ${gregorianMonth} ${gregorianYear}`,

        bangla:
            `${toBanglaNumber(banglaDay)} ${banglaMonths[banglaMonthIndex]} ${toBanglaNumber(banglaYear)}`,

        hijri:
            `${toBanglaNumber(hijriDay)} ${hijriMonthBangla} ${toBanglaNumber(hijriYear)}`
    };
};

const dateParts = article.created_at
    ? getDateParts(article.created_at)
    : null;

        // --------------------------------------------------------
        // PUPPETEER
        // --------------------------------------------------------
        const puppeteer = require("puppeteer");

        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

        const page = await browser.newPage();

        // --------------------------------------------------------
        // LOCKED CANVAS
        // --------------------------------------------------------
        await page.setViewport({
            width: 1080,
            height: 1560,
            deviceScaleFactor: 1
        });

        // --------------------------------------------------------
        // CREATE HTML
        //
        // JavaScript supplies ONLY the selected font size.
        // CSS controls how the text looks.
        // --------------------------------------------------------
        const createHtml = (fontSize) => {
            return `
<!DOCTYPE html>

<html lang="bn">

<head>

<meta charset="UTF-8">

<style>

@font-face {
    font-family: "Nikosh";

    src: url("data:font/ttf;base64,${nikoshBase64}")
         format("truetype");

    font-weight: normal;
    font-style: normal;
}

${epaperCss}

</style>

</head>

<body>

<div class="epaper-page">

    <!-- HEADER -->

<div class="epaper-header">

    ${
        logoData
            ? `
            <img
                class="epaper-logo"
                src="${logoData}"
                alt=""
            >
            `
            : ""
    }

    <div class="epaper-date-row">

        <div class="epaper-date-box">
            প্রকাশ:
            ${dateParts ? dateParts.gregorian : ""}
            |
            ${dateParts ? dateParts.bangla : ""}
            |
            ${dateParts ? dateParts.hijri : ""}
        </div>

        <div class="epaper-date-box">
            প্রিন্ট:
            ${dateParts ? dateParts.gregorian : ""}
            |
            ${dateParts ? dateParts.bangla : ""}
            |
            ${dateParts ? dateParts.hijri : ""}
        </div>

    </div>

    <div class="epaper-title">
        ${escapeHtml(title)}
    </div>

</div>


    <!-- ARTICLE -->

   <div
    class="epaper-content"
    style="--article-font-size: ${fontSize}px;"
>

    ${
        articleImageData
            ? `
            <img
                class="epaper-image"
                src="${articleImageData}"
                width="300"
                height="300"
                alt=""
            >
            `
            : ""
    }

    ${contentHtml}

</div>




<!-- FOOTER / CONTACT DETAILS -->

<div class="epaper-footer">
    <div>📢 প্রকাশক: মোঃ খালেদ আহমেদ</div>
    <div>📞 যোগাযোগ : +৮৮০ ১৭৪১-৪৮২৬৩৪</div>
    <div>✉️ ইমেইল: doiniktalash tv.online@gmail.com</div>
    <div>🌐 ওয়েবসাইট: doiniktalash-tv.online</div>
</div>



</body>

</html>
`;
        };

        // ========================================================
        // 1. AUTOMATIC FONT-SIZE CANDIDATES
        //
        // Largest size is tested first.
        // ========================================================
        const fontSizes = [
            30,
            29,
            28,
            27,
            26,
            25,
            24,
            23,
            22,
            21,
            20,
            19,
            18,
            17
        ];

        let selectedFontSize = 17;

        // ========================================================
        // 2. CHECK WHETHER THE ARTICLE ACTUALLY FITS
        // ========================================================
        const checkArticleFit = async () => {

            return await page.evaluate(() => {

                const content =
                    document.querySelector(
                        ".epaper-content"
                    );

                if (!content) {
                    return false;
                }

                /*
                 * The article must fit inside the fixed
                 * e-paper content area.
                 */

                const fitsVertically =
                    content.scrollHeight <=
                    content.clientHeight + 2;

                const fitsHorizontally =
                    content.scrollWidth <=
                    content.clientWidth + 2;

                return (
                    fitsVertically &&
                    fitsHorizontally
                );
            });
        };

        // ========================================================
        // 3. TEST EACH FONT SIZE
        //
        // First size that fits = largest usable size.
        // ========================================================
        for (const fontSize of fontSizes) {

            await page.setContent(
                createHtml(fontSize),
                {
                   waitUntil: "domcontentloaded",
        timeout: 10000
                }
            );

            // Wait for Nikosh
            await page.evaluate(async () => {

                if (document.fonts) {
                    await document.fonts.ready;
                }

            });

            const fits =
                await checkArticleFit();

            console.log(
                `E-paper font test: ${fontSize}px -> ${
                    fits
                        ? "FITS"
                        : "TOO LARGE"
                }`
            );

            if (fits) {

                selectedFontSize =
                    fontSize;

                break;
            }
        }

        console.log(
            `E-paper selected font size: ${selectedFontSize}px`
        );

        // --------------------------------------------------------
        // FINAL RENDER USING SELECTED SIZE
        // --------------------------------------------------------
        await page.setContent(
            createHtml(selectedFontSize),
            {
               waitUntil: "domcontentloaded",
        timeout: 10000
            }
        );

        await page.evaluate(async () => {

            if (document.fonts) {
                await document.fonts.ready;
            }

        });

        // --------------------------------------------------------
        // GENERATE JPEG
        // --------------------------------------------------------
        const imageBuffer =
            await page.screenshot({
                type: "jpeg",
                quality: 95,

                clip: {
                    x: 0,
                    y: 0,
                    width: 1080,
                    height: 1560
                }
            });

        // --------------------------------------------------------
        // CLOSE BROWSER
        // --------------------------------------------------------
        await browser.close();
        browser = null;

        // --------------------------------------------------------
        // SEND IMAGE
        // --------------------------------------------------------
        res.setHeader(
            "Content-Type",
            "image/jpeg"
        );

        res.setHeader(
            "Content-Disposition",
            `inline; filename="DOINIK_TALASH_TV_${id}.jpg"`
        );

        res.send(imageBuffer);

    } catch (error) {

        console.error(
            "E-paper image generation error:",
            error
        );

        if (browser) {

            try {
                await browser.close();
            } catch (closeError) {
                console.error(
                    "Browser close error:",
                    closeError
                );
            }

        }

        res.status(500).json({
            error: "Failed to generate e-paper image",
            details: error.message
        });
    }
});
app.get("/api/news/:id/jpg", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid article ID"
        });
    }

    try {
        // =========================================================
        // STEP 1 — GET ARTICLE
        // =========================================================

        const [rows] = await pool.query(
            "SELECT * FROM news WHERE id = ? LIMIT 1",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Article not found"
            });
        }

        const article = rows[0];

        // =========================================================
        // STEP 2 — CANVAS
        // =========================================================

        const WIDTH = 1080;
        const HEIGHT = 1180;

        // =========================================================
        // STEP 3 — LOGO
        // =========================================================

        const logoPath = path.join(__dirname, "logo.jpg");

        if (!fs.existsSync(logoPath)) {
            return res.status(500).json({
                message: "Logo file not found"
            });
        }

        const logoBuffer = await sharp(logoPath)
            .resize({
                width: 280,
                withoutEnlargement: true
            })
            .jpeg()
            .toBuffer();

        const logoBase64 = logoBuffer.toString("base64");

        // =========================================================
        // STEP 4 — DATE
        // =========================================================

        const dateText = article.created_at
            ? new Date(article.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric"
            })
            : "";

        // =========================================================
        // STEP 5 — ARTICLE PHOTO
        // =========================================================

        let articleImageBase64 = "";

        if (article.image) {
            const imageBuffer = await getArticleImage(article.image);

            if (imageBuffer) {
                const photoBuffer = await sharp(imageBuffer)
                    .resize(984, 552, {
                        fit: "cover",
                        position: "centre"
                    })
                    .jpeg({
                        quality: 90
                    })
                    .toBuffer();

                articleImageBase64 = photoBuffer.toString("base64");
            }
        }

        // =========================================================
        // STEP 6 — EXACT PHOTO SHAPE
        // =========================================================

        const photoPoints = `
            49,149
            909,149
            1033,273
            1033,601
            1033,701
            149,701
            49,601
        `;

        // =========================================================
        // STEP 7 — TITLE PREPARATION
        // =========================================================

        const rawTitle = String(article.title || "News");

        const escapedTitle = rawTitle
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");

        const titleWords = escapedTitle.split(/\s+/);

        const titleLines = [];
        let currentLine = "";

        for (const word of titleWords) {
            const testLine = currentLine
                ? `${currentLine} ${word}`
                : word;

            if (testLine.length > 28 && currentLine) {
                titleLines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            titleLines.push(currentLine);
        }

        const titleSvg = titleLines
            .slice(0, 4)
            .map((line, index) => `
                <tspan
                    x="540"
                    dy="${index === 0 ? 0 : 62}"
                >${line}</tspan>
            `)
            .join("");

        // =========================================================
        // STEP 8 — CREAM / RED BACKGROUND
        // =========================================================

        const svg = `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="${WIDTH}"
            height="${HEIGHT}"
            viewBox="0 0 ${WIDTH} ${HEIGHT}"
        >

            <defs>

                <linearGradient
                    id="creamRedBlend"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stop-color="#F7EDE8"
                    />

                    <stop
                        offset="28%"
                        stop-color="#F7EDE8"
                    />

                    <stop
                        offset="40%"
                        stop-color="#F2C2B9"
                    />

                    <stop
                        offset="50%"
                        stop-color="#E95A50"
                    />

                    <stop
                        offset="60%"
                        stop-color="#DE1610"
                    />

                    <stop
                        offset="70%"
                        stop-color="#D60000"
                    />

                    <stop
                        offset="100%"
                        stop-color="#B80000"
                    />
                </linearGradient>

                <clipPath id="photoClip">
                    <polygon points="${photoPoints}" />
                </clipPath>
                <linearGradient
    id="newsLink"
    x1="0"
    y1="0"
    x2="1"
    y2="0"
>
    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
    <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>

<filter
    id="glow"
    x="-50%"
    y="-50%"
    width="200%"
    height="200%"
>
    <feGaussianBlur
        stdDeviation="8"
        result="blur"
    />
</filter>

<style>
    .newsText {
        font-family: Arial, sans-serif;
        font-size: 28px;
        font-weight: 700;
        fill: #FFFFFF;
    }
</style>

            </defs>

            <!-- =================================================
                 STEP 9 — FULL BACKGROUND
                 ================================================= -->

            <rect
                x="0"
                y="0"
                width="${WIDTH}"
                height="${HEIGHT}"
                fill="url(#creamRedBlend)"
            />

            <!-- =================================================
                 LOGO
                 ================================================= -->

            <image
                href="data:image/jpeg;base64,${logoBase64}"
                x="49"
                y="25"
                width="280"
                height="140"
                preserveAspectRatio="xMinYMin meet"
                style="mix-blend-mode:multiply"
            />

            <!-- =================================================
                 DATE
                 ================================================= -->

            <text
                x="1015"
                y="88"
                text-anchor="end"
                font-family="Arial, sans-serif"
                font-size="30"
                font-weight="600"
                fill="#222222"
            >${dateText}</text>

            <!-- =================================================
                 PHOTO
                 ================================================= -->

            ${
                articleImageBase64
                    ? `
            <image
                href="data:image/jpeg;base64,${articleImageBase64}"
                x="49"
                y="149"
                width="984"
                height="552"
                preserveAspectRatio="xMidYMid slice"
                clip-path="url(#photoClip)"
            />
            `
                    : ""
            }

            <!-- =================================================
                 PHOTO WHITE BORDER
                 ================================================= -->

            <polygon
                points="${photoPoints}"
                fill="none"
                stroke="#FFFFFF"
                stroke-width="8"
                stroke-linejoin="round"
            />

            <!-- =================================================
                 STEP 10 — TITLE ONLY
                 ================================================= -->

            <text
                x="540"
                y="865"
                text-anchor="middle"
                font-family="Arial, sans-serif"
                font-size="48"
                font-weight="700"
                fill="#FFFFFF"
            >${titleSvg}</text>

        
<!-- =====================================================
     LEFT PIXEL DECORATIONS
     ===================================================== -->

<g fill="#ff6666" opacity="0.65">

    <!-- row 1 -->
    <rect x="8"  y="735" width="12" height="12"/>
    <rect x="32" y="759" width="12" height="12"/>

    <!-- row 2 -->
    <rect x="8"  y="783" width="12" height="12"/>
    <rect x="56" y="807" width="12" height="12"/>
    <rect x="32" y="831" width="12" height="12"/>

    <!-- row 3 -->
    <rect x="8"  y="855" width="12" height="12"/>
    <rect x="32" y="879" width="12" height="12"/>
    <rect x="56" y="903" width="12" height="12"/>

    <!-- row 4 -->
    <rect x="8"  y="927" width="12" height="12"/>
    <rect x="32" y="951" width="12" height="12"/>
    <rect x="8"  y="975" width="12" height="12"/>

    <!-- row 5 -->
    <rect x="56" y="999" width="12" height="12"/>
    <rect x="32" y="1023" width="12" height="12"/>
    <rect x="8"  y="1047" width="12" height="12"/>

    <!-- row 6 -->
    <rect x="32" y="1071" width="12" height="12"/>
    <rect x="56" y="1071" width="12" height="12"/>

    <!-- horizontal extension -->
    <rect x="80" y="807" width="12" height="12"/>
    <rect x="80" y="879" width="12" height="12"/>
    <rect x="80" y="951" width="12" height="12"/>
    <rect x="80" y="1023" width="12" height="12"/>

    <!-- pixels inside NEWS LINK area -->

<rect x="8"  y="1095" width="12" height="12"/>
<rect x="32" y="1119" width="12" height="12"/>
<rect x="56" y="1143" width="12" height="12"/>

<rect x="8"  y="1167" width="12" height="12"/>

</g>


<!-- =====================================================
     RIGHT PIXEL DECORATIONS
     ===================================================== -->

<g fill="#ff6666" opacity="0.65">

    <!-- row 1 -->
    <rect x="1060" y="735" width="12" height="12"/>
    <rect x="1036" y="759" width="12" height="12"/>

    <!-- row 2 -->
    <rect x="1060" y="783" width="12" height="12"/>
    <rect x="1012" y="807" width="12" height="12"/>
    <rect x="1036" y="831" width="12" height="12"/>

    <!-- row 3 -->
    <rect x="1060" y="855" width="12" height="12"/>
    <rect x="1036" y="879" width="12" height="12"/>
    <rect x="1012" y="903" width="12" height="12"/>

    <!-- row 4 -->
    <rect x="1060" y="927" width="12" height="12"/>
    <rect x="1036" y="951" width="12" height="12"/>
    <rect x="1060" y="975" width="12" height="12"/>

    <!-- row 5 -->
    <rect x="1012" y="999" width="12" height="12"/>
    <rect x="1036" y="1023" width="12" height="12"/>
    <rect x="1060" y="1047" width="12" height="12"/>

    <!-- row 6 -->
    <rect x="1036" y="1071" width="12" height="12"/>
    <rect x="1012" y="1071" width="12" height="12"/>

    <!-- horizontal extension -->
    <rect x="988" y="807" width="12" height="12"/>
    <rect x="988" y="879" width="12" height="12"/>
    <rect x="988" y="951" width="12" height="12"/>
    <rect x="988" y="1023" width="12" height="12"/>

    <!-- pixels inside NEWS LINK area -->

<rect x="1060" y="1095" width="12" height="12"/>
<rect x="1036" y="1119" width="12" height="12"/>
<rect x="1012" y="1143" width="12" height="12"/>

<rect x="1060" y="1167" width="12" height="12"/>

</g>
 
 <!-- =====================================================
                 NEWS LINK GLOW AREA
                 ===================================================== -->

            <rect
                x="150"
                y="638"
                width="420"
                height="48"
                rx="24"
                fill="url(#newsLink)"
                opacity="0.55"
                filter="url(#glow)"
            />


            <!-- =====================================================
                 NEWS LINK TEXT
                 ===================================================== -->
<!-- NEWS LINK -->

<rect
    x="0"
    y="1095"
    width="1080"
    height="8"
    fill="url(#newsLink)"
/>
<rect
    x="0"
    y="1095"
    width="1080"
    height="8"
    fill="url(#newsLink)"
/>

<rect
    x="0"
    y="1103"
    width="1080"
    height="77"
    fill="url(#creamRedBlend)"
    opacity="0.10"
/>

<text
    x="540"
    y="1152"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="28"
    font-weight="700"
    fill="#FFFFFF"
>
     «««« নিউজ লিংক কমেন্টে »»»»
</text>
        </svg>
        `;

        const jpgBuffer = await sharp(Buffer.from(svg))
            .jpeg({
                quality: 95
            })
            .toBuffer();

        res.set({
            "Content-Type": "image/jpeg",
            "Content-Disposition":
                `attachment; filename="DOINIK_TALASH_TV_${id}.jpg"`
        });

        res.send(jpgBuffer);

    } catch (err) {
        console.error("JPG generation error:", err);

        res.status(500).json({
            message: "Unable to generate JPG",
            error: err.message
        });
    }
});

app.listen(PORT, async () => {
    console.log(`DOINIK TALASH TV is running at http://localhost:${PORT}`);
    await testDatabase();
});
