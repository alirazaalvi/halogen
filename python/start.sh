#!/bin/bash
# Start Python AI service in venv

cd python
source venv/bin/activate
uvicorn api:app --reload --port 8000