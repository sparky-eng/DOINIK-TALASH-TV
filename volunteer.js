const form = document.getElementById("volunteer-news-form");
const message = document.getElementById("volunteer-message");

const imageFile = document.getElementById("volunteer-image-file");
const imageName = document.getElementById("volunteer-image-name");


// =========================================
// IMAGE SELECTION
// =========================================

imageFile.addEventListener("change", function () {

    if (imageFile.files.length > 0) {
        imageName.textContent =
            imageFile.files[0].name;
    } else {
        imageName.textContent =
            "No image selected";
    }

});


// =========================================
// PUBLISH NEWS
// =========================================

form.addEventListener("submit", async function (event) {

    event.preventDefault();

    message.textContent =
        "Uploading image...";

    try {

        if (imageFile.files.length === 0) {
            throw new Error(
                "Please select a news image."
            );
        }

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

        const uploadResult =
            await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(
                uploadResult.message ||
                "Image upload failed"
            );
        }

        const newsData = {

            title:
                document
                    .getElementById("volunteer-title")
                    .value
                    .trim(),

            category:
                document
                    .getElementById("volunteer-category")
                    .value,

            description:
                document
                    .getElementById("volunteer-description")
                    .value
                    .trim(),

            image:
                uploadResult.image,

            content:
                document
                    .getElementById("volunteer-content")
                    .value
                    .trim()
        };

        message.textContent =
            "Publishing news...";

        const response = await fetch(
            "/api/volunteer/news",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(newsData)
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to publish news"
            );
        }

        message.textContent =
            `News published successfully! Article ID: ${result.id}`;

        form.reset();

        imageName.textContent =
            "No image selected";

        loadVolunteerNews();

    } catch (error) {

        console.error(
            "Volunteer publish error:",
            error
        );

        message.textContent =
            `Unable to publish news: ${error.message}`;
    }

});


// =========================================
// LOAD PUBLISHED NEWS
// =========================================

async function loadVolunteerNews() {

    const grid =
        document.getElementById(
            "volunteer-news-grid"
        );

    if (!grid) return;

    try {

        const response =
            await fetch("/api/news");

        if (!response.ok) {
            throw new Error(
                `News API returned ${response.status}`
            );
        }

        const news =
            await response.json();

        grid.innerHTML = "";

        if (
            !Array.isArray(news) ||
            news.length === 0
        ) {
            grid.innerHTML =
                "<p>No published news available.</p>";

            return;
        }

        news.forEach(item => {

            const card =
                document.createElement("article");

            card.className =
                "news-card";

            const image =
                String(item.image || "");

            const title =
                String(
                    item.title ||
                    "Untitled news"
                );

            const description =
                String(
                    item.description || ""
                );

            const category =
                String(
                    item.category ||
                    "NEWS"
                ).toUpperCase();

            const id =
                Number(item.id);

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

                <h3>
                    ${title}
                </h3>

                <p>
                    ${description}
                </p>

                <a
                    href="article.html?id=${id}"
                    class="read-more"
                >
                    View Article
                </a>

            `;

            grid.appendChild(card);

        });

    } catch (error) {

        console.error(
            "Volunteer news error:",
            error
        );

        grid.innerHTML =
            "<p>Unable to load published news right now.</p>";
    }
}

loadVolunteerNews();


// =========================================
// VOLUNTEER LOGOUT
// =========================================

const logoutButton =
    document.getElementById(
        "volunteer-logout-button"
    );

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async function () {

            try {

                const response =
                    await fetch(
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
                    "/volunteer-login.html";

            } catch (error) {

                console.error(
                    "Volunteer logout error:",
                    error
                );

                alert(
                    "Unable to logout. Please try again."
                );
            }
        }
    );

}