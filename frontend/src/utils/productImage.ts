import { SyntheticEvent } from 'react';

export function getLegacyAmazonImageUrl(asin: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`;
}

export function getPreferredProductImageUrl(product: { asin: string; image_url?: string }): string {
  return product.image_url || getLegacyAmazonImageUrl(product.asin);
}

export function handleProductImageError(
  event: SyntheticEvent<HTMLImageElement, Event>,
  asin: string
): void {
  const img = event.currentTarget;
  const legacyUrl = getLegacyAmazonImageUrl(asin);

  if (img.src !== legacyUrl) {
    img.src = legacyUrl;
    return;
  }

  (img.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
}
