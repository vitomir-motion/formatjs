import {
  generateCurrencyDataForLocales,
  generateUnitDataForLocales,
  generateNumberDataForLocales,
  locales,
  extractCurrencyDigits,
} from 'formatjs-extract-cldr-data';
import {
  SANCTIONED_UNITS,
  getAliasesByLang,
  getParentLocalesByLang,
  removeUnitNamespace,
  RawNumberLocaleData,
} from '@formatjs/intl-utils';
import {resolve, join} from 'path';
import {outputFileSync, outputJSONSync} from 'fs-extra';

const allLocaleDistDir = resolve(__dirname, '../dist/locale-data');

const numbersData = generateNumberDataForLocales();
const currenciesData = generateCurrencyDataForLocales();
const unitsData = generateUnitDataForLocales();

const allData = locales.reduce(
  (all: Record<string, RawNumberLocaleData>, locale) => {
    const resolvedLocale = locale === 'en-US-POSIX' ? 'en-US' : locale;
    const lang = resolvedLocale.split('-')[0];
    const aliases = getAliasesByLang(lang);
    const parentLocales = getParentLocalesByLang(lang);
    if (!all[resolvedLocale]) {
      all[resolvedLocale] = {
        data: {
          [resolvedLocale]: {
            units: unitsData[locale],
            currencies: currenciesData[locale],
            numbers: numbersData[locale],
            nu: numbersData[locale].nu,
          },
        },
        availableLocales: [resolvedLocale],
        aliases,
        parentLocales,
      };
    }

    return all;
  },
  {}
);

outputFileSync(
  resolve(__dirname, '../src/units-constants.ts'),
  `/* @generated */
// prettier-ignore
export type Unit =
  ${SANCTIONED_UNITS.map(unit => `'${removeUnitNamespace(unit)}'`).join(' | ')}
`
);

// Dist all locale files to dist/locale-data
Object.keys(allData).forEach(function(locale) {
  const destFile = join(allLocaleDistDir, locale + '.js');
  outputFileSync(
    destFile,
    `/* @generated */
// prettier-ignore
if (Intl.NumberFormat && typeof Intl.NumberFormat.__addLocaleData === 'function') {
  Intl.NumberFormat.__addLocaleData(${JSON.stringify(allData[locale])})
}`
  );
});

// Dist all locale files to dist/locale-data
Object.keys(allData).forEach(function(locale) {
  const destFile = join(allLocaleDistDir, locale + '.json');
  outputJSONSync(destFile, allData[locale]);
});

// Aggregate all into ../polyfill-locales.js
outputFileSync(
  resolve(__dirname, '../polyfill-locales.js'),
  `/* @generated */
// prettier-ignore
require('./polyfill')
if (Intl.NumberFormat && typeof Intl.NumberFormat.__addLocaleData === 'function') {
  Intl.NumberFormat.__addLocaleData(
    ${Object.keys(allData)
      .map(locale => JSON.stringify(allData[locale]))
      .join(',\n')});
}
`
);

// Output currency digits file
outputJSONSync(
  resolve(__dirname, '../src/currency-digits.json'),
  extractCurrencyDigits()
);

// For test262
// Only a subset of locales
outputFileSync(
  resolve(__dirname, '../dist-es6/polyfill-locales.js'),
  `
import './polyfill';
if (Intl.NumberFormat && typeof Intl.NumberFormat.__addLocaleData === 'function') {
  Intl.NumberFormat.__addLocaleData(
    ${['ar', 'de', 'en-US', 'en', 'ja', 'ko', 'th', 'zh', 'zh-Hant', 'zh-Hans']
      .map(locale => JSON.stringify(allData[locale]))
      .join(',\n')});
}
`
);
