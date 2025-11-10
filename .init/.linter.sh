#!/bin/bash
cd /home/kavia/workspace/code-generation/weekly-insight-report-platform-22440-22609/backendexpress
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

