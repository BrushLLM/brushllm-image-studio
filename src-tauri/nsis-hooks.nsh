; Extra NSIS defines for the installer.
;
; MUI2's language dialog is skipped when the registry already remembers a
; language from a previous install (MUI_LANGDLL_REGISTRY_*), so users
; reinstalling or updating would never see the selector. ALWAYSSHOW makes
; the first-page language dialog appear on every run; the remembered
; language only preselects the dropdown.
!define MUI_LANGDLL_ALWAYSSHOW
