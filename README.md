# video-abuse-system
# Fast AI Video Abuse Detection System

वीडियो की प्रारंभिक तुलना और केस रिपोर्ट तैयार करने के लिए FastAPI आधारित प्रोटोटाइप।

## Features

- मूल और संदिग्ध वीडियो अपलोड
- वीडियो के नमूना फ्रेमों की तुलना
- केस ID और समय के साथ रिपोर्ट
- केस हिस्ट्री
- JSON रिपोर्ट डाउनलोड और कॉपी
- हिंदी टेक्स्ट-टू-स्पीच, यदि ब्राउज़र समर्थन करे
- मोबाइल-फ्रेंडली डार्क डैशबोर्ड
- Render deployment configuration

## Project structure

```text
video-abuse-system/
├── app.py
├── requirements.txt
├── render.yaml
├── .gitignore
├── .env.example
├── README.md
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

## Run on Android using Termux

Install Python and Git:

```bash
pkg update
pkg install python git -y
```

Enter the project folder, then install dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn app:app --host 127.0.0.1 --port 8000
```

Open this address in your phone browser:

http://127.0.0.1:8000

## API endpoints

- `GET /api/health` — server status
- `GET /api/cases` — saved case list
- `POST /api/analyze` — compare two uploaded videos
- `GET /api/report/{case_id}` — retrieve a case report

## Current limitations

This is an early prototype, not a complete AI abuse detector.

The current comparison uses sampled grayscale frame histograms. It does not reliably detect abusive speech, altered voiceovers, impersonation, or platform policy violations.

A similarity score alone is not proof of abuse or copying. Review the evidence manually before submitting a complaint.

Reports are prepared for review; the application does not automatically submit them to TikTok or other platforms.

Before public deployment, add authentication, upload limits at the hosting layer, rate limiting, secure evidence handling, and durable database storage. Render's temporary filesystem may not preserve case history after a restart or redeployment.

Do not upload private or sensitive videos to a public deployment without appropriate security and consent safeguards.
