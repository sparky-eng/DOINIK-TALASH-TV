const form = document.getElementById("volunteer-login-form");
const message = document.getElementById("volunteer-login-message");

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    message.textContent = "Logging in...";

    const username = document
        .getElementById("username")
        .value
        .trim();

    const password = document
        .getElementById("password")
        .value;

    try {
        const response = await fetch("/api/volunteer/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "Login failed"
            );
        }

        message.textContent =
            "Login successful. Opening Volunteer Panel...";

        window.location.href = "/volunteer.html";

    } catch (error) {
        console.error(
            "Volunteer login error:",
            error
        );

        message.textContent =
            `Unable to login: ${error.message}`;
    }
});