import { el, normalizeAssetPath } from '../lib/utils.js';

export function renderBeautyStyles(data) {
  const beauty = data.beauty_coupons;
  if (!beauty || !beauty.pools) {
    return el('div', { textContent: 'No beauty coupon/style data found.' });
  }

  // Group pools: type -> coupon_id -> { meta, genders: { male: [], female: [] } }
  const byType = {};
  for (const pool of beauty.pools) {
    const t = pool.style_type;
    const g = pool.gender;
    if (!byType[t]) byType[t] = {};
    if (!byType[t][pool.coupon_id]) {
      byType[t][pool.coupon_id] = {
        coupon_id: pool.coupon_id,
        coupon_name: pool.coupon_name,
        coupon_desc: pool.coupon_desc,
        coupon_thumbnail: pool.coupon_thumbnail,
        genders: {},
      };
    }
    byType[t][pool.coupon_id].genders[g] = pool.styles;
  }

  const container = el('div', { className: 'beauty-container' });
  const bodyDiv = el('div', { className: 'beauty-body' });
  container.appendChild(el('div', {
    className: 'beauty-warning',
    textContent: 'These coupons show the full pool of possible styles tied to each coupon. Nexon may rotate which styles are actually available at any given time.',
  }));
  container.appendChild(bodyDiv);

  const TYPE_LABELS = { hair: 'Hair Styles', face: 'Face Styles' };
  const TYPE_ORDER = ['hair', 'face'];
  const GENDER_ORDER = ['male', 'female'];

  for (const t of TYPE_ORDER) {
    if (!byType[t]) continue;

    const typeSection = el('div', { className: 'beauty-type-section' });
    typeSection.appendChild(el('h2', { className: 'beauty-type-heading', textContent: TYPE_LABELS[t] || t }));

    const couponsDiv = el('div', { className: 'beauty-coupons' });
    for (const coupon of Object.values(byType[t])) {
      couponsDiv.appendChild(makeCouponSection(coupon));
    }
    typeSection.appendChild(couponsDiv);
    bodyDiv.appendChild(typeSection);
  }

  function makeCouponSection(coupon) {
    const section = el('div', { className: 'beauty-coupon-section' });

    // Header
    const header = el('div', { className: 'beauty-coupon-header' });
    if (coupon.coupon_thumbnail) {
      header.appendChild(el('img', {
        className: 'beauty-coupon-thumb',
        src: normalizeAssetPath(coupon.coupon_thumbnail),
        alt: coupon.coupon_name,
      }));
    }
    const headerText = el('div', { className: 'beauty-coupon-header-text' });
    headerText.appendChild(el('span', { className: 'beauty-coupon-name', textContent: coupon.coupon_name }));
    if (coupon.coupon_desc) {
      headerText.appendChild(el('span', { className: 'beauty-coupon-desc', textContent: coupon.coupon_desc }));
    }
    header.appendChild(headerText);
    section.appendChild(header);

    // One gender block per available gender
    for (const g of GENDER_ORDER) {
      const styles = coupon.genders[g];
      if (!styles || !styles.length) continue;

      const genderBlock = el('div', { className: 'beauty-gender-block' });
      genderBlock.appendChild(el('div', { className: 'beauty-gender-label', textContent: g.charAt(0).toUpperCase() + g.slice(1) }));

      const grid = el('div', { className: 'beauty-style-grid' });
      for (const style of styles) {
        const card = el('div', { className: 'beauty-style-card' });
        if (style.thumbnail) {
          card.appendChild(el('img', {
            className: 'beauty-style-thumb',
            src: normalizeAssetPath(style.thumbnail),
            alt: style.name,
          }));
        } else {
          card.appendChild(el('div', { className: 'beauty-style-placeholder' }));
        }
        card.appendChild(el('div', { className: 'beauty-style-name', textContent: style.name }));
        card.appendChild(el('div', { className: 'beauty-style-id id', textContent: style.id }));
        grid.appendChild(card);
      }
      genderBlock.appendChild(grid);
      section.appendChild(genderBlock);
    }

    return section;
  }

  return container;
}
