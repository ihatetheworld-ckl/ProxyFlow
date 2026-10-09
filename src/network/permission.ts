export function websitePattern(url: URL): string {
  return url.protocol + "//" + url.hostname + "/*";
}
