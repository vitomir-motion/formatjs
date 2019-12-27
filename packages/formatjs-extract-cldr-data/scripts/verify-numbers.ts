import {sync as globSync} from 'glob';
import {resolve, dirname} from 'path';
import * as Numbers from 'cldr-numbers-full/main/en/numbers.json';
import { PLURAL_RULES } from '../src/utils';
import { InternalSlotToken } from '@formatjs/intl-utils';

const numberDataFiles = globSync('*/numbers.json', {
  cwd: resolve(
    dirname(require.resolve('cldr-numbers-full/package.json')),
    './main'
  ),
}).map(p => `cldr-numbers-full/main/${p}`);

const numbersData: Array<typeof Numbers> = numberDataFiles.map(p => require(p));

function extractCompactSymbolFromPattern(pattern: string, slotToken: InternalSlotToken = InternalSlotToken.compactSymbol): string {
  const compactUnit = pattern.replace(/[¤0\-]/g, '').trim();
  return compactUnit ? pattern.replace(compactUnit, `{${slotToken}}`) : pattern
}

function checkLDML (locale:string, patterns: Record<string, string>): void {
  const keys = Object.keys(patterns)
  for (const k of keys) {
    const [type] = k.split('-')
    for (const ldml of PLURAL_RULES) {
      const k = `${type}-count-${ldml}`
      if (patterns[k] && extractCompactSymbolFromPattern(patterns[k]) !== extractCompactSymbolFromPattern(patterns[`${type}-count-other`])) {
        console.log(`${locale} Pattern for ${k} is different from other: ${patterns[k]} vs ${patterns[`${type}-count-other`]}`)
      }
    }
  }
}

numbersData.forEach(d => {
  const locale = Object.keys(d.main)[0] as 'en';
  const data = d.main[locale].numbers;
  if (data['scientificFormats-numberSystem-latn'].standard !== '#E0') {
    console.log(
      `${locale} has uncommon (#E0) scientific format: ${data['scientificFormats-numberSystem-latn'].standard}`
    );
  }
  // if (data['percentFormats-numberSystem-latn'].standard !== '#,##0%') {
  //   console.log(
  //     `${locale} has uncommon (#,##0%) percent format: ${data['percentFormats-numberSystem-latn'].standard}`
  //   );
  // }
  if (
    data['currencyFormats-numberSystem-latn'].currencySpacing.afterCurrency
      .currencyMatch !== '[:^S:]'
  ) {
    console.log(
      `${locale} has uncommon ([:^S:]) currencySpacing: ${data['currencyFormats-numberSystem-latn'].currencySpacing.afterCurrency.currencyMatch}`
    );
  }
  if (
    data['currencyFormats-numberSystem-latn'].currencySpacing.afterCurrency
      .insertBetween !==
    data['currencyFormats-numberSystem-latn'].currencySpacing.beforeCurrency
      .insertBetween
  ) {
    console.log(
      `${locale} has different insertBetween between before and after`
    );
  }
  checkLDML(locale, data['decimalFormats-numberSystem-latn'].long.decimalFormat)
  checkLDML(locale, data['decimalFormats-numberSystem-latn'].short.decimalFormat)
  checkLDML(locale, data['currencyFormats-numberSystem-latn'].short.standard)
});
