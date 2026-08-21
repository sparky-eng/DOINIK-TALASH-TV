const express = require("express");
const mysql = require("mysql2/promise");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const PDFDocument = require("pdfkit");
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
app.get("/api/news/:id/pdf", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid article ID"
        });
    }

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

        const article = rows[0];

        /*
        =========================================================
        DOINIK TALASH TV
        SQUARE PDF PAPER
        REFERENCE SIZE: 720 x 707
        =========================================================
        */

        const doc = new PDFDocument({
            size: [720, 707],
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        });

        doc.registerFont("Bengali", BENGALI_FONT);

        const safeTitle = String(article.title || "news")
            .replace(/[^a-z0-9]/gi, "_")
            .substring(0, 80);

        res.setHeader("Content-Type", "application/pdf");

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="DOINIK_TALASH_TV_${safeTitle}.pdf"`
        );

        doc.pipe(res);


        /*
        =========================================================
        WHITE BACKGROUND
        =========================================================
        */

        doc
            .rect(0, 0, 720, 707)
            .fill("#ffffff");


        /*
        =========================================================
        RED OUTER BORDER
        =========================================================
        */

        doc
            .save()
            .lineWidth(2)
            .strokeColor("#d71920")
            .roundedRect(1, 1, 718, 705, 22)
            .stroke()
            .restore();


        /*
        =========================================================
        LOGO
        TOP LEFT
        =========================================================
        */

        const logoPath = path.join(__dirname, "logo.jpg");

        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 55, 26, {
                fit: [230, 55],
                align: "left",
                valign: "center"
            });
        }


        /*
        =========================================================
        DATE
        TOP RIGHT
        =========================================================
        */

        let publishedDate = "Date unavailable";

        if (article.created_at) {
            const date = new Date(article.created_at);

            if (!isNaN(date)) {
                publishedDate = date.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                });
            } else {
                publishedDate = article.created_at;
            }
        }

        doc
            .font("Helvetica")
            .fontSize(16)
            .fillColor("#d71920")
            .text(
                publishedDate,
                540,
                28,
                {
                    width: 125,
                    align: "right"
                }
            );


        /*
        =========================================================
        RED DIVIDER
        =========================================================
        */

        doc
            .save()
            .lineWidth(2)
            .strokeColor("#d71920")
            .moveTo(38, 89)
            .lineTo(682, 89)
            .stroke()
            .restore();


        /*
        =========================================================
        FEATURE IMAGE
        =========================================================
        */

        if (article.image) {
            try {
                const imagePath = path.join(
                    __dirname,
                    article.image.replace(/^\/+/, "")
                );

                if (fs.existsSync(imagePath)) {

                    const imageX = 32;
                    const imageY = 111;
                    const imageWidth = 655;
                    const imageHeight = 358;
                    const imageRadius = 16;

                    doc
                        .save()
                        .roundedRect(
                            imageX,
                            imageY,
                            imageWidth,
                            imageHeight,
                            imageRadius
                        )
                        .clip();

                    doc.image(imagePath, imageX, imageY, {
                        fit: [imageWidth, imageHeight],
                        align: "center",
                        valign: "center"
                    });

                    doc.restore();
                }

            } catch (imageError) {
                console.log(
                    "PDF image could not be loaded:",
                    imageError.message
                );
            }
        }


        /*
        =========================================================
        DYNAMIC NEWS TITLE
        =========================================================
        */

        doc
            .font("Bengali")
            .fontSize(32)
            .fillColor("#d71920")
            .text(
                String(article.title || ""),
                75,
                505,
                {
                    width: 570,
                    align: "center",
                    lineGap: 4
                }
            );


        /*
        =========================================================
        NEWS LINK BUTTON
        =========================================================
        */

        doc
            .save()
            .fillColor("#d71920")
            .roundedRect(
                38,
                616,
                644,
                62,
                12
            )
            .fill()
            .restore();

        doc
            .font("Bengali")
            .fontSize(18)
            .fillColor("#ffffff")
            .text(
                "<<< নিউজ লিংক কমেন্টে >>>",
                38,
                634,
                {
                    width: 644,
                    align: "center"
                }
            );


        /*
        =========================================================
        END PDF
        =========================================================
        */

        doc.end();

    } catch (err) {

        console.error(
            "PDF generation failed:",
            err.message
        );

        if (!res.headersSent) {
            res.status(500).json({
                message: "Unable to generate PDF"
            });
        }
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
app.listen(PORT, async () => {
    console.log(`DOINIK TALASH TV is running at http://localhost:${PORT}`);
    await testDatabase();
});