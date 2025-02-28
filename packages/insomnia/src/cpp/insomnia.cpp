// NOTE: The calls in this wrapper are only supported on Windows >= 8.
#define _WIN32_WINNT 0x602
#define __INSOMNIA_OUTPUT_BUFFER_SIZE 8192

#include <cstdio>
#include <io.h>
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
                   MB_YESNO | MB_ICONWARNING);

  if (ret == IDYES) {
    // Open the issue report URL in the default browser
    // NOTE: ShellExecute is still vulnerable to the .dll hijacking attack
    // (╯°□°）╯︵ ┻━┻
    ::ShellExecute(0, 0, INSOMNIA_ISSUE_URL, NULL, NULL, cmdShow);
  } else if (ret == IDNO) {
    // Do nothing, just exit
    return 1;
  }
  return 1;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                   LPSTR lpCmdLine, int nCmdShow) {

  // preserve the output from the original executable
  ::AttachConsole(-1);

  ::PROCESS_MITIGATION_POLICY psp = ::ProcessSignaturePolicy;
  ::PROCESS_MITIGATION_POLICY pilp = ::ProcessImageLoadPolicy;
  ::PROCESS_MITIGATION_BINARY_SIGNATURE_POLICY pmbsp;
  ::PROCESS_MITIGATION_IMAGE_LOAD_POLICY pmil;
  ::PROCESS_INFORMATION pi;
  ::SECURITY_ATTRIBUTES sa;
  ::STARTUPINFO si;
  ::DWORD insomniaOutputBytesRead;
  char insomniaOutputBuffer[__INSOMNIA_OUTPUT_BUFFER_SIZE];

  if (!::GetProcessMitigationPolicy(::GetCurrentProcess(), psp, &pmbsp,
                                    sizeof(pmbsp)))
    return ::ExitWithWarning(nCmdShow, "Could not get ProcessImageLoadPolicy.");

  if (pmbsp.MitigationOptIn == 0) {
    pmbsp.MitigationOptIn = 1;
    if (!::SetProcessMitigationPolicy(psp, &pmbsp, sizeof(pmbsp)))
      return ::ExitWithWarning(nCmdShow,
                               "Could not set ProcessImageLoadPolicy.");
  }
  if (!::GetProcessMitigationPolicy(::GetCurrentProcess(), pilp, &pmil,
                                    sizeof(pmil)))
    return ::ExitWithWarning(nCmdShow, "Could not get ProcessImageLoadPolicy.");

  if (pmil.PreferSystem32Images == 0) {
    pmil.PreferSystem32Images = 1;
    if (!::SetProcessMitigationPolicy(pilp, &pmil, sizeof(pmil))) {
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

  if (!::CreatePipe(&outrd, &outwr, &sa, 0))
    return ::ExitWithWarning(nCmdShow, "Could not create pipe.");

  if (!::SetHandleInformation(outrd, HANDLE_FLAG_INHERIT, 0))
    return ::ExitWithWarning(nCmdShow, "Could not set handle information.");

  si.cb = sizeof(si);
  si.dwFlags |= STARTF_USESTDHANDLES;
  si.hStdOutput = outwr;
  si.hStdError = outwr;

  if (!::CreateProcess(NULL, (LPSTR) "Insomnia.dll", NULL, NULL, TRUE, 0, NULL,
                       NULL, &si, &pi)) {
    ::CloseHandle(outrd);
    ::CloseHandle(outwr);
    return ::ExitWithWarning(nCmdShow, "Could not Launch Insomnia.");
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

  // wait for the process to finish (probably arlready done since the read handle is not readable)
  ::WaitForSingleObject(pi.hProcess, INFINITE);

  // release the handles
  ::CloseHandle(pi.hProcess);
  ::CloseHandle(pi.hThread);

  return 0;
}
