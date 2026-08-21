function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const form = document.getElementById("add-news-form");
const message = document.getElementById("admin-message");

const imageFile = document.getElementById("image-file");
const imageInput = document.getElementById("image");
const imageName = document.getElementById("image-name");

imageFile.addEventListener("change", function () {
    if (imageFile.files.length > 0) {
        imageName.textContent = imageFile.files[0].name;
    } else {
        imageName.textContent = "No image selected";
    }
});

const editId = new URLSearchParams(window.location.search).get("edit");
const submitButton = form.querySelector("button[type='submit']");

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    message.textContent = "Publishing news...";

    let imageUrl = imageInput.value.trim();

    if (imageFile.files.length > 0) {
        message.textContent = "Uploading image...";

        const imageFormData = new FormData();

        imageFormData.append(
            "image",
            imageFile.files[0]
        );

        const uploadResponse = await fetch(
            "/api/upload-image",
            {
                method: "POST",
                body: imageFormData
            }
        );

        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(
                uploadResult.message ||
                "Image upload failed"
            );
        }

        imageUrl = uploadResult.image;
    }

    if (!imageUrl) {
        throw new Error("Please select a news image.");
    }

    const newsData = {
        title: document.getElementById("title").value.trim(),
        category: document.getElementById("category").value,
        description: document.getElementById("description").value.trim(),
        image: imageUrl,
        content: document.getElementById("content").value.trim()
    };

    try {
        const url = editId
            ? `/api/news/${encodeURIComponent(editId)}`
            : "/api/news";

        const method = editId ? "PUT" : "POST";

        const response = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(newsData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to publish news"
            );
        }

        if (editId) {
            message.textContent =
                `News updated successfully! Article ID: ${result.id}`;

            window.location.href = "admin.html";
        } else {
            message.textContent =
                `News published successfully! Article ID: ${result.id}`;

            form.reset();
        }

    } catch (error) {
        console.error("Publish error:", error);

        message.textContent =
            `Unable to publish news: ${error.message}`;
    }
});

async function loadAdminNews() {
    const grid = document.getElementById("admin-news-grid");

    if (!grid) return;

    try {
        const response = await fetch("/api/news");

        if (!response.ok) {
            throw new Error(
                `News API returned ${response.status}`
            );
        }

        const news = await response.json();

        grid.innerHTML = "";

        if (!Array.isArray(news) || news.length === 0) {
            grid.innerHTML =
                "<p>No published news available.</p>";
            return;
        }

        news.forEach(item => {
            const card = document.createElement("article");
            card.className = "news-card";

            const image = escapeHtml(item.image || "");
            const title = escapeHtml(
                item.title || "Untitled news"
            );
            const description = escapeHtml(
                item.description || ""
            );

            const category = escapeHtml(
                String(item.category || "NEWS").toUpperCase()
            );

            const id = Number(item.id);

            card.innerHTML = `
                <div class="card-image">
                    <img
                        src="${image}"
                        alt="${title}"
                        loading="lazy"
                    >
                </div>

                <span class="category">
                    ${category}
                </span>

                <h3>${title}</h3>

                <p>${description}</p>

                <a
                    href="article.html?id=${id}"
                    class="read-more"
                >
                    View Article
                </a>

                <a
                    href="admin.html?edit=${id}"
                    class="read-more"
                >
                    Edit
                </a>

                <button
                    type="button"
                    class="delete-news-button"
                    data-id="${id}"
                >
                    Delete
                </button>
            `;

            grid.appendChild(card);
        });

    } catch (error) {
        console.error("Admin news error:", error);

        grid.innerHTML =
            "<p>Unable to load published news right now.</p>";
    }
}

loadAdminNews();

async function loadEditArticle() {
    if (!editId) return;

    try {
        const response = await fetch(
            `/api/news/${encodeURIComponent(editId)}`
        );

        if (!response.ok) {
            throw new Error(
                `Article API returned ${response.status}`
            );
        }

        const article = await response.json();

        document.getElementById("title").value =
            article.title || "";

        document.getElementById("category").value =
            article.category || "";

        document.getElementById("description").value =
            article.description || "";

        document.getElementById("image").value =
            article.image || "";

        document.getElementById("content").value =
            article.content || "";

        submitButton.textContent = "Update News";

        message.textContent =
            `Editing Article ID: ${article.id}`;

    } catch (error) {
        console.error(
            "Load edit article error:",
            error
        );

        message.textContent =
            "Unable to load article for editing.";
    }
}

loadEditArticle();

document.addEventListener("click", async function (event) {

    if (!event.target.classList.contains("delete-news-button")) {
        return;
    }

    const id = event.target.dataset.id;

    const confirmed = confirm(
        "Are you sure you want to delete this news article?"
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `/api/news/${id}`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to delete news"
            );
        }

        alert("News deleted successfully!");

        loadAdminNews();

    } catch (error) {
        console.error(
            "Delete error:",
            error
        );

        alert(
            `Unable to delete news: ${error.message}`
        );
    }
});

const logoutButton =
    document.getElementById("logout-button");

if (logoutButton) {
    logoutButton.addEventListener(
        "click",
        async function () {

            try {
                const response = await fetch(
                    "/api/admin/logout",
                    {
                        method: "POST"
                    }
                );

                const result =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        result.message ||
                        "Logout failed"
                    );
                }

                window.location.href =
                    "/admin-login.html";

            } catch (error) {
                console.error(
                    "Logout error:",
                    error
                );

                alert(
                    "Unable to logout. Please try again."
                );
            }
        }
    );
}
async function loadDashboardOverview() {
    const totalNewsCount = document.getElementById("total-news-count");
    const categoryCount = document.getElementById("category-count");
    const latestNewsTitle = document.getElementById("latest-news-title");

    if (!totalNewsCount || !categoryCount || !latestNewsTitle) {
        return;
    }

    try {
        const response = await fetch("/api/news");

        if (!response.ok) {
            throw new Error(`News API returned ${response.status}`);
        }

        const news = await response.json();

        if (!Array.isArray(news)) {
            throw new Error("Invalid news data");
        }

        // Total news
        totalNewsCount.textContent = news.length;

        // Unique categories
        const categories = new Set(
            news
                .map(item => String(item.category || "").trim().toLowerCase())
                .filter(category => category !== "")
        );

        categoryCount.textContent = categories.size;

        // Latest news
        if (news.length > 0) {
            latestNewsTitle.textContent =
                news[0].title || "Untitled news";
        } else {
            latestNewsTitle.textContent = "No news available";
        }

    } catch (error) {
        console.error("Dashboard overview error:", error);

        totalNewsCount.textContent = "—";
        categoryCount.textContent = "—";
        latestNewsTitle.textContent = "Unable to load";
    }
}

loadDashboardOverview();