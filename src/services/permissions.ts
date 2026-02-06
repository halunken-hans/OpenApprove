export function canAccessCustomer(tokenCustomer: string | null | undefined, processCustomer: string): boolean {
  if (!tokenCustomer) return false;
  return tokenCustomer === processCustomer;
}

export function canAccessMyUploads(tokenUploader: string | null | undefined, processUploader: string): boolean {
  if (!tokenUploader) return false;
  return tokenUploader === processUploader;
}
