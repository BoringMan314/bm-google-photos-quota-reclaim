# ADB — Android Debug Bridge

Run `UpdatePlatformTools.bat` in the project root to download the latest Windows Platform Tools from Google into this folder.

https://developer.android.com/tools/releases/platform-tools

This folder should contain:
- `adb.exe`
- `AdbWinApi.dll`
- `AdbWinUsbApi.dll`
- `version.txt` — Platform-Tools revision (written by the update script)

Do not commit the binaries.

After placing the files here, the ADB badge in the GUI will turn green once your Pixel is connected.
