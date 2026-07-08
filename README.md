# Work Note

업무 메모장 GitHub Pages 배포 저장소입니다.

## Links

- Current app: https://dd15963-max.github.io/Work_Note/
- React preview: https://dd15963-max.github.io/Work_Note/react/

## Data Safety

The published app code does not include customer data, backup ZIP/JSON files, or original attachments.
Work records are stored in each browser's local storage and IndexedDB.

Before publishing, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\public-safety-check.ps1 -Mode full
```

This repository also uses local Git hooks and GitHub Actions to block backup files, exports, and attachment-like files from being committed.

## React Preview

The React preview is a read-only first phase. It reads the existing `salesNoteAppDataV1` localStorage data and focuses on safer navigation, search, schedule review, and mobile-friendly layouts without overwriting the current app data.
