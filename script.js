const params = new URLSearchParams(window.location.search);
const category = params.get("category");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createNewsCard(item) {
    const article = document.createElement("article");
    article.className = "news-card";

    const image = escapeHtml(
        item.image ||
        "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=900&q=80"
    );

    const title = escapeHtml(item.title || "Untitled news");
    const description = escapeHtml(item.description || "");
   const categoryLabels = {
    national: "জাতীয়",
    politics: "রাজনীতি",
    world: "বিশ্ব",
    sports: "খেলা",
    business: "ব্যবসা",
    technology: "প্রযুক্তি",
    entertainment: "বিনোদন",
    news: "সংবাদ"
};

const categoryName =
    categoryLabels[String(item.category || "news").toLowerCase()] || "সংবাদ";

    const id = Number(item.id);

    let publishedDate = "Latest";

    if (item.created_at) {
        const date = new Date(item.created_at);

        if (!Number.isNaN(date.getTime())) {
            publishedDate = date.toLocaleDateString("en-BD", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        }
    }

    article.innerHTML = `
        <div class="card-image">
            <img
                src="${image}"
                alt="${title}"
                loading="lazy"
                onerror="this.src='https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=900&q=80'"
            >
        </div>

        <div class="card-body">

            <div class="card-meta">
                <span class="category">${categoryName}</span>
                <time>${escapeHtml(publishedDate)}</time>
            </div>

            <h3>
                <a href="article.html?id=${id}">
                    ${title}
                </a>
            </h3>

            <p>${description}</p>

            <a href="article.html?id=${id}" class="read-more">
                বিস্তারিত পড়ুন →
            </a>

        </div>
    `;

    return article;
}

async function loadFeaturedNews() {
    const featuredImage = document.getElementById("featured-image");
    const featuredCategory = document.getElementById("featured-category");
    const featuredTitle = document.getElementById("featured-title");
    const featuredDescription = document.getElementById("featured-description");
    const featuredLink = document.getElementById("featured-link");

    if (
        !featuredImage ||
        !featuredCategory ||
        !featuredTitle ||
        !featuredDescription ||
        !featuredLink
    ) {
        return;
    }

    try {
        const response = await fetch("/api/news");

        if (!response.ok) {
            throw new Error(`News API returned ${response.status}`);
        }

        const news = await response.json();

        if (!Array.isArray(news) || news.length === 0) {
            featuredTitle.textContent = "No featured news available";
            featuredDescription.textContent = "";
            return;
        }

        const item = news[0];

        featuredImage.src = item.image || "";
        featuredImage.alt = item.title || "Featured news";

        featuredCategory.textContent =
            String(item.category || "NEWS").toUpperCase();

        featuredTitle.textContent =
            item.title || "Untitled news";

        featuredDescription.textContent =
            item.description || "";

        featuredLink.href =
            `article.html?id=${Number(item.id)}`;

    } catch (error) {
        console.error("Featured news error:", error);

        featuredTitle.textContent =
            "Unable to load featured news";

        featuredDescription.textContent =
            "Please try again later.";
    }
}
async function loadHomepageNews() {
    const grid = document.getElementById("api-news-grid");
    if (!grid) return;

    grid.innerHTML = "<p>Loading latest news...</p>";

    try {
        const response = await fetch("/api/news");
        if (!response.ok) throw new Error(`News API returned ${response.status}`);

        const news = await response.json();
        grid.innerHTML = "";

        if (!Array.isArray(news) || news.length === 0) {
            grid.innerHTML = "<p>No news is available yet.</p>";
            return;
        }

        news.forEach(item => grid.appendChild(createNewsCard(item)));
    } catch (error) {
        console.error("Homepage news error:", error);
        grid.innerHTML = "<p>Unable to load latest news right now.</p>";
    }
}

async function loadCategoryNews() {
    const grid = document.getElementById("category-news-grid");
    const title = document.getElementById("category-title");
    if (!grid || !category) return;

  const categoryLabels = {
    national: "জাতীয়",
    politics: "রাজনীতি",
    world: "বিশ্ব",
    sports: "খেলা",
    business: "ব্যবসা",
    technology: "প্রযুক্তি",
    entertainment: "বিনোদন",
    news: "সংবাদ"
};

const formattedCategory = categoryLabels[category] || "সংবাদ";

if (title) {
    title.textContent = `${formattedCategory} সংবাদ`;
}
    grid.innerHTML = "<p>Loading category news...</p>";

    try {
        const response = await fetch(`/api/news/category/${encodeURIComponent(category)}`);
        if (!response.ok) throw new Error(`Category API returned ${response.status}`);

        const news = await response.json();
        grid.innerHTML = "";

        if (!Array.isArray(news) || news.length === 0) {
            grid.innerHTML = `<p>No ${escapeHtml(formattedCategory.toLowerCase())} news is available yet.</p>`;
            return;
        }

        news.forEach(item => grid.appendChild(createNewsCard(item)));
    } catch (error) {
        console.error("Category news error:", error);
        grid.innerHTML = "<p>Unable to load category news right now.</p>";
    }
}
async function loadBreakingNews() {
    const breakingText = document.getElementById("breaking-news-text");

    if (!breakingText) return;

    try {
        const response = await fetch("/api/news");

        if (!response.ok) {
            throw new Error(`News API returned ${response.status}`);
        }

        const news = await response.json();

        if (!Array.isArray(news) || news.length === 0) {
            breakingText.textContent = "No breaking news available.";
            return;
        }

        const item = news[0];

        breakingText.textContent =
            item.title || "Latest news and important updates from around the world.";

    } catch (error) {
        console.error("Breaking news error:", error);

        breakingText.textContent =
            "Unable to load breaking news right now.";
    }
}
loadBreakingNews();
loadFeaturedNews();
loadHomepageNews();
loadCategoryNews();
function setActiveNavigation() {
    const navLinks = document.querySelectorAll("#main-nav a");
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const currentCategory = new URLSearchParams(window.location.search).get("category");

    navLinks.forEach(link => {
        link.classList.remove("active");

        const href = link.getAttribute("href");

        if (currentPage === "index.html" && href === "index.html") {
            link.classList.add("active");
        }

        if (
            currentPage === "category.html" &&
            currentCategory &&
            href === `category.html?category=${currentCategory}`
        ) {
            link.classList.add("active");
        }
    });
}

setActiveNavigation();