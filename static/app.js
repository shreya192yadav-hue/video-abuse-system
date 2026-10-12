
"use strict";

/* ==========================================
   FAST AI VIDEO ABUSE DETECTION SYSTEM
   Frontend JavaScript
   File: static/app.js
========================================== */

const API_BASE = "";

const $ = (selector) => document.querySelector(selector);

const state = {
    cases: [],
    loading: false
};

/* ---------- DOM HELPERS ---------- */

function showMessage(message, type = "info") {
    let box = $("#statusMessage");

    if (!box) {
        box = document.createElement("div");
        box.id = "statusMessage";
        box.setAttribute("role", "status");
        document.body.prepend(box);
    }

    box.textContent = message;
    box.dataset.type = type;
    box.style.display = "block";
}

function setLoading(loading) {
    state.loading = loading;

    document.querySelectorAll(
        '[type="submit"], [data-action="analyze"]'
    ).forEach((button) => {
        button.disabled = loading;
    });

    const indicator = $("#loadingIndicator");

    if (indicator) {
        indicator.style.display = loading ? "block" : "none";
        indicator.textContent = loading
            ? "Analyzing videos..."
            : "";
    }
}

async function apiRequest(path, options = {}) {
    const response = await fetch(API_BASE + path, options);

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("Server returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}

/* ---------- HEALTH CHECK ---------- */

async function checkServer() {
    const indicator = $("#serverStatus");

    try {
        const data = await apiRequest("/api/health");

        if (indicator) {
            indicator.textContent =
                data.status === "ok" || data.status === "healthy"
                    ? "SERVER ONLINE"
                    : "SERVER CONNECTED";
            indicator.dataset.status = "online";
        }

        return data;
    } catch (error) {
        if (indicator) {
            indicator.textContent = "SERVER OFFLINE";
            indicator.dataset.status = "offline";
        }

        console.error("Health check failed:", error);
        return null;
    }
}

/* ---------- VIDEO UPLOAD ---------- */

function getVideoFile(inputSelector) {
    const input = $(inputSelector);

    return input && input.files
        ? input.files[0] || null
        : null;
}

function validateVideo(file, label) {
    if (!file) {
        throw new Error(`Please select the ${label} video.`);
    }

    if (!file.type.startsWith("video/")) {
        throw new Error(`${label} file must be a video.`);
    }

    return file;
}

function updateFileName(inputSelector, outputSelector) {
    const input = $(inputSelector);
    const output = $(outputSelector);

    if (!input || !output) return;

    input.addEventListener("change", () => {
        const file = input.files && input.files[0];

        output.textContent = file
            ? file.name
            : "No file selected";
    });
}

/* ---------- VIDEO ANALYSIS ---------- */

async function analyzeVideos(event) {
    if (event) event.preventDefault();

    if (state.loading) return;

    try {
        const original = getVideoFile("#originalVideo");
        const suspect = getVideoFile("#suspectVideo");

        validateVideo(original, "original");
        validateVideo(suspect, "suspected");

        const description =
            ($("#description")?.value || "").trim();

        const formData = new FormData();

        formData.append("original", original);
        formData.append("suspect", suspect);
        formData.append("description", description);

        setLoading(true);
        showMessage("Uploading videos for analysis...", "info");

        const result = await apiRequest("/api/analyze", {
            method: "POST",
            body: formData
        });

        displayReport(result);
        await loadCases();

        showMessage(
            "Analysis completed. Review the results carefully.",
            "success"
        );

    } catch (error) {
        console.error("Analysis failed:", error);
        showMessage(error.message, "error");
    } finally {
        setLoading(false);
    }
}

/* ---------- DISPLAY REPORT ---------- */

function createElement(tag, text, className) {
    const element = document.createElement(tag);

    if (text !== undefined && text !== null) {
        element.textContent = String(text);
    }

    if (className) {
        element.className = className;
    }

    return element;
}

function displayReport(report) {
    const container = $("#reportResults");

    if (!container) {
        console.log("Analysis report:", report);
        return;
    }

    container.replaceChildren();

    const heading = createElement("h2", "Analysis Report");
    container.appendChild(heading);

    const fields = [
        ["Case ID", report.case_id],
        ["Status", report.status],
        ["Created", report.created_at],
        ["Description", report.description]
    ];

    fields.forEach(([label, value]) => {
        if (value === undefined || value === null || value === "") {
            return;
        }

        const row = createElement("p");
        row.appendChild(
            createElement("strong", `${label}: `)
        );
        row.appendChild(
            document.createTextNode(String(value))
        );

        container.appendChild(row);
    });

    const comparison = report.comparison;

    if (comparison && typeof comparison === "object") {
        container.appendChild(
            createElement("h3", "Video Comparison")
        );

        const metrics = [
            [
                "Average histogram similarity",
                comparison.average_histogram_similarity_percent,
                "%"
            ],
            [
                "Original duration",
                comparison.original_duration_seconds,
                " seconds"
            ],
            [
                "Suspected duration",
                comparison.suspect_duration_seconds,
                " seconds"
            ],
            [
                "Sampled frames compared",
                comparison.sampled_frames_compared,
                ""
            ]
        ];

        metrics.forEach(([label, value, suffix]) => {
            if (value === undefined || value === null) return;

            container.appendChild(
                createElement(
                    "p",
                    `${label}: ${value}${suffix}`
                )
            );
        });

        if (comparison.limitation) {
            container.appendChild(
                createElement(
                    "p",
                    `Limitation: ${comparison.limitation}`
                )
            );
        }
    }

    if (report.case_id) {
        const downloadButton = createElement(
            "button",
            "View / Download Report"
        );

        downloadButton.type = "button";

        downloadButton.addEventListener("click", () => {
            window.open(
                `/api/report/${encodeURIComponent(report.case_id)}`,
                "_blank",
                "noopener"
            );
        });

        container.appendChild(downloadButton);
    }

    container.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* ---------- CASE HISTORY ---------- */

async function loadCases() {
    const container = $("#caseHistory");

    try {
        const data = await apiRequest("/api/cases");

        state.cases = Array.isArray(data)
            ? data
            : Array.isArray(data.cases)
                ? data.cases
                : [];

        if (!container) return state.cases;

        container.replaceChildren();

        if (state.cases.length === 0) {
            container.appendChild(
                createElement("p", "No cases available yet.")
            );

            return state.cases;
        }

        state.cases.forEach((item) => {
            const card = createElement("div", undefined, "case-card");

            card.appendChild(
                createElement("h3", `Case ${item.case_id || "Unknown"}`)
            );

            card.appendChild(
                createElement("p", `Status: ${item.status || "Unknown"}`)
            );

            if (item.created_at) {
                card.appendChild(
                    createElement("p", `Date: ${item.created_at}`)
                );
            }

            if (item.description) {
                card.appendChild(
                    createElement("p", item.description)
                );
            }

            if (item.case_id) {
                const button = createElement("button", "Open Report");
                button.type = "button";

                button.addEventListener("click", () => {
                    window.open(
                        `/api/report/${encodeURIComponent(item.case_id)}`,
                        "_blank",
                        "noopener"
                    );
                });

                card.appendChild(button);
            }

            container.appendChild(card);
        });

        return state.cases;

    } catch (error) {
        console.error("Could not load cases:", error);

        if (container) {
            container.replaceChildren(
                createElement("p", "Unable to load case history.")
            );
        }

        return [];
    }
}

/* ---------- OPTIONAL URL ANALYSIS ---------- */

async function analyzeVideoUrls(event) {
    if (event) event.preventDefault();

    if (state.loading) return;

    try {
        const originalUrl = ($("#originalUrl")?.value || "").trim();
        const suspectUrl = ($("#suspectUrl")?.value || "").trim();
        const description = ($("#description")?.value || "").trim();

        if (!originalUrl || !suspectUrl) {
            throw new Error("Enter both video URLs.");
        }

        let first;
        let second;

        try {
            first = new URL(originalUrl);
            second = new URL(suspectUrl);
        } catch {
            throw new Error("Please enter valid video URLs.");
        }

        if (!["http:", "https:"].includes(first.protocol) ||
            !["http:", "https:"].includes(second.protocol)) {
            throw new Error("Only HTTP and HTTPS URLs are supported.");
        }

        const formData = new FormData();

        formData.append("original_url", originalUrl);
        formData.append("suspect_url", suspectUrl);
        formData.append("description", description);

        setLoading(true);
        showMessage("Submitting video URLs...", "info");

        const result = await apiRequest("/api/analyze", {
            method: "POST",
            body: formData
        });

        displayReport(result);
        await loadCases();

        showMessage("Request completed.", "success");

    } catch (error) {
        console.error("URL analysis failed:", error);
        showMessage(error.message, "error");
    } finally {
        setLoading(false);
    }
}

/* ---------- EXPORT CASE HISTORY ---------- */

function exportCases() {
    if (!state.cases.length) {
        showMessage("There are no cases to export.", "error");
        return;
    }

    const blob = new Blob(
        [JSON.stringify(state.cases, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "video-abuse-cases.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showMessage("Case history exported.", "success");
}

/* ---------- INITIALIZATION ---------- */

document.addEventListener("DOMContentLoaded", () => {
    // File input labels
    updateFileName("#originalVideo", "#originalFileName");
    updateFileName("#suspectVideo", "#suspectFileName");

    // Analysis form
    const uploadForm = $("#analysisForm");

    if (uploadForm) {
        uploadForm.addEventListener("submit", analyzeVideos);
    }

    // URL form, if included in the HTML
    const urlForm = $("#urlAnalysisForm");

    if (urlForm) {
        urlForm.addEventListener("submit", analyzeVideoUrls);
    }

    // Buttons
    $("#refreshCases")?.addEventListener("click", loadCases);
    $("#exportCases")?.addEventListener("click", exportCases);

    // Buttons using data-action
    document.querySelectorAll("[data-action]").forEach((button) => {
        const action = button.dataset.action;

        if (action === "analyze") {
            button.addEventListener("click", analyzeVideos);
        }

        if (action === "refresh") {
            button.addEventListener("click", loadCases);
        }

        if (action === "export") {
            button.addEventListener("click", exportCases);
        }
    });

    // Initial dashboard load
    checkServer();
    loadCases();
});
