async function loadDashboardOverview() {
    const totalNewsCount =
        document.getElementById("total-news-count");

    const categoryCount =
        document.getElementById("category-count");

    const latestNewsTitle =
        document.getElementById("latest-news-title");

    try {
        const response = await fetch("/api/news");

        if (!response.ok) {
            throw new Error(
                `News API returned ${response.status}`
            );
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
                .map(item =>
                    String(item.category || "")
                        .trim()
                        .toLowerCase()
                )
                .filter(category => category !== "")
        );

        categoryCount.textContent = categories.size;

        // Latest news
        if (news.length > 0) {
            latestNewsTitle.textContent =
                news[0].title || "Untitled news";
        } else {
            latestNewsTitle.textContent =
                "No news available";
        }

    } catch (error) {
        console.error(
            "Dashboard overview error:",
            error
        );

        totalNewsCount.textContent = "—";
        categoryCount.textContent = "—";
        latestNewsTitle.textContent =
            "Unable to load";
    }
}

loadDashboardOverview();


// =========================================
// ADMIN LOGOUT
// =========================================

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