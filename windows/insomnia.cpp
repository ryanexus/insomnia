// NOTE: The calls in this wrapper are only supported on Windows >= 8.
#define _WIN32_WINNT 0x602
#define __INSOMNIA_OUTPUT_BUFFER_SIZE 8192

#include "resource.h"
#include <cstdio>
#include <io.h>
#include <string>
#include <windows.h>

const char *INSOMNIA_ISSUE_REPORT_PREFIX =
    "\n\nPlease report this issue on GitHub:\n";
const char *INSOMNIA_ISSUE_URL = "https://github.com/Kong/insomnia/issues";
const char *INSOMNIA_ISSUE_REPORT_POSTFIX =
    "\nWould you like to open the issue report URL in your default browser?";

HANDLE hDebugLog;
BOOL handleCreated = FALSE;

void DebugLog(const char *msg) {
  if (handleCreated) {
    ::WriteFile(hDebugLog, msg, strlen(msg), NULL, NULL);
    ::WriteFile(hDebugLog, "\n", 1, NULL, NULL);
  }
}

std::string WideToString(const std::wstring &wstr) {
  if (wstr.empty())
    return "";

  int size_needed =
      WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, NULL, 0, NULL, NULL);
  if (size_needed <= 0)
    return "";

  std::string str(size_needed - 1, 0);
  WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), -1, &str[0], size_needed, NULL,
                      NULL);
  return str;
}

std::string GetOrCreateTemporaryDirectory() {
  char tempPath[MAX_PATH];
  if (GetTempPathA(MAX_PATH, tempPath)) {
    std::string tempDir(tempPath);
    tempDir += "insomnia-";

    UUID uuid;
    WCHAR wszUuid[39];
    if (UuidCreate(&uuid) == RPC_S_OK) {
      int converted = StringFromGUID2(uuid, wszUuid, 39);
      if (converted) {
        tempDir += WideToString(wszUuid);
      } else {
        ::WriteFile(hDebugLog, "Could not convert guid\n", 23, NULL, NULL);
      }
    } else {
      ::WriteFile(hDebugLog, "Could not append uuid\n", 22, NULL, NULL);
    }

    CreateDirectoryA(tempDir.c_str(), NULL);
    return tempDir;
  }
  return "";
}

bool ExtractResourceToFile(int resourceId, std::string *filePath) {
  HRSRC hResource =
      ::FindResource(NULL, MAKEINTRESOURCE(resourceId), RT_RCDATA);
  if (!hResource) {
    return false;
  }

  HGLOBAL hLoadedResource = ::LoadResource(NULL, hResource);
  if (!hLoadedResource) {
    return false;
  }

  DWORD resourceSize = ::SizeofResource(NULL, hResource);
  void *pResourceData = ::LockResource(hLoadedResource);

  HANDLE hFile = CreateFile(filePath->c_str(), GENERIC_WRITE, 0, NULL,
                            CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (hFile == INVALID_HANDLE_VALUE) {
    return false;
  }

  DWORD bytesWritten;
  bool written =
      ::WriteFile(hFile, pResourceData, resourceSize, &bytesWritten, NULL);
  ::CloseHandle(hFile);

  return written && (bytesWritten == resourceSize);
}

int ExitWithWarning(int cmdShow, const char *msg) {
  if (handleCreated) {
    ::CloseHandle(hDebugLog);
  }
  ::TCHAR finalMsg[strlen(msg) + strlen(INSOMNIA_ISSUE_REPORT_PREFIX) +
                   strlen(INSOMNIA_ISSUE_URL) +
                   strlen(INSOMNIA_ISSUE_REPORT_POSTFIX) + 1];
  strcpy_s(finalMsg, sizeof(finalMsg), msg);
  strcat_s(finalMsg, sizeof(finalMsg), INSOMNIA_ISSUE_REPORT_PREFIX);
  strcat_s(finalMsg, sizeof(finalMsg), INSOMNIA_ISSUE_URL);
  strcat_s(finalMsg, sizeof(finalMsg), INSOMNIA_ISSUE_REPORT_POSTFIX);
  int ret =
      ::MessageBox(NULL, finalMsg, "Insomnia was unable to start up properly",
                   MB_YESNO | MB_ICONERROR);

  if (ret == IDYES) {
    // Open the issue report URL in the default browser
    ::ShellExecute(0, 0, INSOMNIA_ISSUE_URL, NULL, NULL, cmdShow);
  } else if (ret == IDNO) {
    // Do nothing, just exit
    return 1;
  }
  return 1;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                   LPSTR lpCmdLine, int nCmdShow) {
  hDebugLog = ::CreateFile("C:\\Users\\ryan\\insomnia.log", FILE_APPEND_DATA,
                           FILE_SHARE_WRITE, NULL, OPEN_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
  if (hDebugLog == INVALID_HANDLE_VALUE) {
    return ::ExitWithWarning(nCmdShow, "Could not create debug log file.");
  }
  handleCreated = TRUE;
  DebugLog("==========================================");
  std::string tmpDir = GetOrCreateTemporaryDirectory();
  if (tmpDir == "") {
    return ::ExitWithWarning(nCmdShow, "Could not create temporary directory.");
  } else {
    std::string msg("Temporary directory created: ");
    msg += tmpDir;
    DebugLog(msg.c_str());
  }

  std::string exePath = tmpDir + "\\Insomnia.exe";

  DebugLog("Extracting Insomnia.exe to temporary directory...");
  DebugLog(exePath.c_str());

  int extracted = ExtractResourceToFile(IDR_INSOMNIA, &exePath);
  if (!extracted) {
    return ::ExitWithWarning(
        nCmdShow, "Could not provide a secure execution environment.");
  }

  char thisExecutable[MAX_PATH];
  ::GetModuleFileName(NULL, thisExecutable, sizeof(thisExecutable));

  DebugLog("This executable: ");
  DebugLog(thisExecutable);

  std::string currentPath(thisExecutable);
  currentPath = currentPath.substr(0, currentPath.find_last_of("\\/"));

  DebugLog("Current path: ");
  DebugLog(currentPath.c_str());

  DebugLog("Command line: ");
  DebugLog(lpCmdLine);

  // preserve the output from the original executable
  ::AttachConsole(-1);
  ::WriteConsole(::GetStdHandle(STD_OUTPUT_HANDLE), "Insomnia is starting...\n",
                 25, NULL, NULL);
  ::WriteConsole(::GetStdHandle(STD_OUTPUT_HANDLE), lpCmdLine,
                 strlen(lpCmdLine), NULL, NULL);
  ::WriteConsole(::GetStdHandle(STD_OUTPUT_HANDLE), "\n", 1, NULL, NULL);

  ::PROCESS_MITIGATION_POLICY psp = ::ProcessSignaturePolicy;
  ::PROCESS_MITIGATION_POLICY pilp = ::ProcessImageLoadPolicy;
  ::PROCESS_MITIGATION_BINARY_SIGNATURE_POLICY pmbsp;
  ::PROCESS_MITIGATION_IMAGE_LOAD_POLICY pmilp;
  ::PROCESS_INFORMATION pi;
  ::SECURITY_ATTRIBUTES sa;
  ::STARTUPINFO si;
  ::DWORD insomniaOutputBytesRead;
  char insomniaOutputBuffer[__INSOMNIA_OUTPUT_BUFFER_SIZE];

  if (!::GetProcessMitigationPolicy(::GetCurrentProcess(), psp, &pmbsp,
                                    sizeof(pmbsp))) {
    return ::ExitWithWarning(nCmdShow, "Could not get ProcessImageLoadPolicy.");
  }

  if (pmbsp.MitigationOptIn == 0) {
    // pmbsp.MitigationOptIn = 1;
    if (!::SetProcessMitigationPolicy(psp, &pmbsp, sizeof(pmbsp))) {
      return ::ExitWithWarning(nCmdShow,
                               "Could not set ProcessImageLoadPolicy.");
    }
  }
  if (!::GetProcessMitigationPolicy(::GetCurrentProcess(), pilp, &pmilp,
                                    sizeof(pmilp))) {
    return ::ExitWithWarning(nCmdShow, "Could not get ProcessImageLoadPolicy.");
  }

  if (pmilp.PreferSystem32Images == 0) {
    pmilp.PreferSystem32Images = 1;
    if (!::SetProcessMitigationPolicy(pilp, &pmilp, sizeof(pmilp))) {
      return ::ExitWithWarning(nCmdShow,
                               "Could not set ProcessImageLoadPolicy.");
    }
  }

  ::ZeroMemory(&pi, sizeof(pi));
  ::ZeroMemory(&si, sizeof(si));

  sa.nLength = sizeof(SECURITY_ATTRIBUTES);
  sa.bInheritHandle = TRUE;
  sa.lpSecurityDescriptor = NULL;

  HANDLE outrd, outwr;

  if (!::CreatePipe(&outrd, &outwr, &sa, 0)) {
    return ::ExitWithWarning(nCmdShow, "Could not create pipe.");
  }

  if (!::SetHandleInformation(outrd, HANDLE_FLAG_INHERIT, 0)) {
    return ::ExitWithWarning(nCmdShow, "Could not set handle information.");
  }

  si.cb = sizeof(si);
  si.dwFlags |= STARTF_USESTDHANDLES;
  si.hStdOutput = outwr;
  si.hStdError = outwr;

  // construct environment variables
  std::string env("ICU_DATA=");
  env += currentPath;
  env += '\0';
  env += '\0';

  int ret = ::CreateProcess(exePath.c_str(), lpCmdLine, NULL, NULL, FALSE, CREATE_UNICODE_ENVIRONMENT, (LPVOID) env.c_str(),
                            currentPath.c_str(), &si, &pi);

  if (!ret) {
    DebugLog("Unable to launch Insomnia.");
    DWORD err = ::GetLastError();
    char *errMsg = NULL;
    ::FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM,
                    NULL, err, 0, (LPTSTR)&errMsg, 0, NULL);
    DebugLog(errMsg);
    ::LocalFree(errMsg);
    DebugLog(__TIME__);
    ::CloseHandle(outrd);
    ::CloseHandle(outwr);
    return ::ExitWithWarning(nCmdShow, "Unable to Launch Insomnia.");
  }

  // yes, close the write handle here, trust me
  ::CloseHandle(outwr);

  // loops until the pipe is closed because the write handle is closed
  while (::ReadFile(outrd, insomniaOutputBuffer,
                    sizeof(insomniaOutputBuffer) - 1, &insomniaOutputBytesRead,
                    NULL) &&
         insomniaOutputBytesRead > 0) {
    ::WriteFile(::GetStdHandle(STD_OUTPUT_HANDLE), insomniaOutputBuffer,
                insomniaOutputBytesRead, NULL, NULL);
    DebugLog(insomniaOutputBuffer);
  }

  // no more to read
  ::CloseHandle(outrd);

  // wait for the process to finish (probably arlready done since the read
  // handle is not readable)
  ::WaitForSingleObject(pi.hProcess, INFINITE);

  // release the handles
  ::CloseHandle(pi.hProcess);
  ::CloseHandle(pi.hThread);
  ::CloseHandle(hDebugLog);

  return 0;
}
