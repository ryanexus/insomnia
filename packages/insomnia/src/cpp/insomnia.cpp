// NOTE: The calls in this wrapper are only supported on Windows >= 8.
#define _WIN32_WINNT 0x602
#define __INSOMNIA_OUTPUT_BUFFER_SIZE 8192

#include <cstdio>
#include <io.h>
#include <string>
#include <windows.h>

const char *INSOMNIA_ISSUE_REPORT_PREFIX =
    "\n\nPlease report this issue on GitHub:\n";
const char *INSOMNIA_ISSUE_URL = "https://github.com/Kong/insomnia/issues";
const char *INSOMNIA_ISSUE_REPORT_POSTFIX =
    "\nWould you like to open the issue report URL in your default browser?";

int ExitWithWarning(int cmdShow, const char *msg) {
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
  HANDLE hDebugLog = ::CreateFile("C:\\Users\\ryan\\insomnia.log",
                                  FILE_APPEND_DATA, FILE_SHARE_WRITE, NULL,
                                  OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (hDebugLog == INVALID_HANDLE_VALUE) {
    return ::ExitWithWarning(nCmdShow, "Could not create debug log file.");
  }
  char insomniaExecutable[MAX_PATH];
  ::GetModuleFileName(NULL, insomniaExecutable, sizeof(insomniaExecutable));

  std::string currentPath(insomniaExecutable);
  currentPath = currentPath.substr(0, currentPath.find_last_of("\\/"));

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
      ::CloseHandle(hDebugLog);
      return ::ExitWithWarning(nCmdShow,
                               "Could not set ProcessImageLoadPolicy.");
    }
  }
  if (!::GetProcessMitigationPolicy(::GetCurrentProcess(), pilp, &pmilp,
                                    sizeof(pmilp))) {
    ::CloseHandle(hDebugLog);
    return ::ExitWithWarning(nCmdShow, "Could not get ProcessImageLoadPolicy.");
  }

  if (pmilp.PreferSystem32Images == 0) {
    pmilp.PreferSystem32Images = 1;
    if (!::SetProcessMitigationPolicy(pilp, &pmilp, sizeof(pmilp))) {
      ::CloseHandle(hDebugLog);
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
    ::CloseHandle(hDebugLog);
    return ::ExitWithWarning(nCmdShow, "Could not create pipe.");
  }

  if (!::SetHandleInformation(outrd, HANDLE_FLAG_INHERIT, 0)) {
    ::CloseHandle(hDebugLog);

    return ::ExitWithWarning(nCmdShow, "Could not set handle information.");
  }

  si.cb = sizeof(si);
  si.dwFlags |= STARTF_USESTDHANDLES;
  si.hStdOutput = outwr;
  si.hStdError = outwr;

  std::string try2(currentPath);
  try2.append("\\Insomnia.dll");

  int ret = ::CreateProcess(try2.c_str(), lpCmdLine, NULL, NULL, TRUE, 0, NULL,
                            currentPath.c_str(), &si, &pi);

  if (!ret) {
    ::WriteFile(hDebugLog, "Could not create process.\n", 26, NULL, NULL);
    ::WriteFile(hDebugLog, lpCmdLine, strlen(lpCmdLine), NULL, NULL);
    ::WriteFile(hDebugLog, "\n", 1, NULL, NULL);
    ::WriteFile(hDebugLog, insomniaExecutable, strlen(insomniaExecutable), NULL,
                NULL);
    ::WriteFile(hDebugLog, "\n", 1, NULL, NULL);
    ::WriteFile(hDebugLog, currentPath.c_str(), currentPath.length(), NULL,
                NULL);
    ::WriteFile(hDebugLog, "\n", 1, NULL, NULL);
    ::WriteFile(hDebugLog, "Closed at ", 10, NULL, NULL);
    ::WriteFile(hDebugLog, __TIME__, strlen(__TIME__), NULL, NULL);
    ::WriteFile(hDebugLog, "\n", 1, NULL, NULL);
    ::CloseHandle(hDebugLog);
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
