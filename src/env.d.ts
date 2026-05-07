/// <reference types="@dcloudio/types" />

declare const wx: {
  openPrivacyContract?: (options: {
    success?: () => void
    fail?: (err: any) => void
    complete?: () => void
  }) => void
}
