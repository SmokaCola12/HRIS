const fallbackAppBaseUrl = 'http://localhost:3000';

export function getPublicAppBaseUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }

  return (process.env.NEXT_PUBLIC_APP_BASE_URL || fallbackAppBaseUrl).replace(/\/$/, '');
}

export function getPublicLoginUrl() {
  return `${getPublicAppBaseUrl()}/login`;
}
