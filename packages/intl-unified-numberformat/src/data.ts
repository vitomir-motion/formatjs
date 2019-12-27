import {
  UnitData,
  CurrencyData,
  RawNumberData,
  LDMLPluralRule,
  DecimalFormatNum,
  NumberILD,
  InternalSlotToken,
  SignDisplayPattern,
  UnitPattern,
  CurrencyPattern,
  LDMLPluralRuleMap,
  NumberLocalePatternData,
  PercentNotationPattern,
} from '@formatjs/intl-utils';

const CURRENCY_DISPLAYS: Array<keyof CurrencyPattern> = [
  'code',
  'symbol',
  'narrowSymbol',
  'name',
];

const SIGN_DISPLAYS: Array<keyof SignDisplayPattern> = [
  'auto',
  'always',
  'never',
  'exceptZero',
];

const UNIT_DISPLAYS: Array<keyof UnitPattern> = ['narrow', 'long', 'short'];

// g flag bc this appears twice in accounting pattern
const CURRENCY_SYMBOL_REGEX = /¤/g;

function extractDecimalFormatILD(
  data?: Record<DecimalFormatNum, LDMLPluralRuleMap<string>> | undefined
): Record<DecimalFormatNum, LDMLPluralRuleMap<string>> | undefined {
  if (!data) {
    return;
  }
  return (Object.keys(data) as Array<DecimalFormatNum>).reduce((all, num) => {
    const pattern = data[num];

    all[num] = (Object.keys(pattern) as Array<LDMLPluralRule>).reduce(
      (all: LDMLPluralRuleMap<string>, p) => {
        all[p] = (pattern[p] || '').replace(/[¤0]/g, '').trim();
        return all;
      },
      {other: pattern.other.replace(/[¤0]/g, '').trim()}
    );
    return all;
  }, {} as Record<DecimalFormatNum, LDMLPluralRuleMap<string>>);
}

function extractLDMLPluralRuleMap<T extends object, K extends keyof T>(
  m: LDMLPluralRuleMap<T>,
  k: K
): LDMLPluralRuleMap<T[K]> {
  return (Object.keys(m) as Array<LDMLPluralRule>).reduce(
    (all: LDMLPluralRuleMap<T[K]>, rule) => {
      all[rule] = m[rule]![k];
      return all;
    },
    {other: m.other[k]}
  );
}

export function extractILD(
  units: Record<string, UnitData>,
  currencies: Record<string, CurrencyData>,
  numbers: RawNumberData,
  numberingSystem: string
): NumberILD {
  return {
    decimal: {
      compactShort: extractDecimalFormatILD(
        numbers.decimal[numberingSystem].short
      ),
      compactLong: extractDecimalFormatILD(
        numbers.decimal[numberingSystem].long
      ),
    },
    currency: {
      compactShort: extractDecimalFormatILD(
        numbers.currency[numberingSystem].short
      ),
    },
    symbols: numbers.symbols[numberingSystem],
    currencySymbols: Object.keys(currencies).reduce((all, code) => {
      all[code] = {
        currencyName: currencies[code].displayName,
        currencySymbol: currencies[code].symbol,
        currencyNarrowSymbol:
          currencies[code].narrow || currencies[code].symbol,
      };
      return all;
    }, {} as NumberILD['currencySymbols']),
    unitSymbols: Object.keys(units).reduce((all, unit) => {
      all[unit] = {
        unitSymbol: extractLDMLPluralRuleMap(units[unit].short, 'symbol'),
        unitNarrowSymbol: extractLDMLPluralRuleMap(
          units[unit].narrow,
          'symbol'
        ),
        unitName: extractLDMLPluralRuleMap(units[unit].long, 'symbol'),
      };
      return all;
    }, {} as NumberILD['unitSymbols']),
  };
}

// Credit: https://github.com/andyearnshaw/Intl.js/blob/master/scripts/utils/reduce.js
// Matches CLDR number patterns, e.g. #,##0.00, #,##,##0.00, #,##0.##, 0, etc.
const NUMBER_PATTERN = /[#0](?:[\.,][#0]+)*/g;
const SCIENTIFIC_SLOT = [
  InternalSlotToken.number,
  InternalSlotToken.scientificSeparator,
  InternalSlotToken.scientificExponent,
]
  .map(t => `{${t}}`)
  .join('');

const DUMMY_PATTERN = '#';

function produceSignPattern(positivePattern: string, negativePattern = '') {
  if (!negativePattern) {
    negativePattern = `{${InternalSlotToken.minusSign}}${positivePattern}`;
  }
  const zeroPattern = positivePattern;
  const alwaysPositivePattern = positivePattern.includes(
    `{${InternalSlotToken.plusSign}}`
  )
    ? positivePattern
    : `{${InternalSlotToken.plusSign}}${positivePattern}`;

  return {
    always: {
      positivePattern: alwaysPositivePattern,
      zeroPattern: alwaysPositivePattern,
      negativePattern,
    },
    exceptZero: {
      positivePattern: alwaysPositivePattern,
      zeroPattern,
      negativePattern,
    },
    never: {
      positivePattern,
      zeroPattern,
      negativePattern: positivePattern,
    },
    auto: {
      positivePattern,
      zeroPattern,
      negativePattern,
    },
  };
}

function extractSignPattern(pattern: string) {
  const patterns = pattern.split(';');

  const [positivePattern, negativePattern] = patterns.map(p =>
    p
      .replace(NUMBER_PATTERN, `{${InternalSlotToken.number}}`)
      .replace('+', `{${InternalSlotToken.plusSign}}`)
      .replace('-', `{${InternalSlotToken.minusSign}}`)
      .replace('%', `{${InternalSlotToken.percentSign}}`)
  );

  return produceSignPattern(positivePattern, negativePattern);
}

const dummySignPattern = extractSignPattern(
  // Dummy
  DUMMY_PATTERN
);

const scientificSignPattern = extractSignPattern(SCIENTIFIC_SLOT);

function aggregateLDMLOther<T extends string>(map: Record<T, LDMLPluralRuleMap<string>>): Record<T, string> {
  return (Object.keys(map) as Array<T>).reduce((all, k) => {
    all[k] = map[k].other
    return all
  }, {} as Record<T, string>)
}

/**
 * Turn compact pattern like `0 trillion` or `¤0 trillion` to
 * `0 {compactSymbol}` or `¤0 {compactSymbol}`
 * @param pattern
 */
function extractCompactSignPattern(
  patterns: Record<DecimalFormatNum, string>,
  slotToken: InternalSlotToken = InternalSlotToken.compactSymbol,
): Record<DecimalFormatNum, string> {
  const compactThresholds = Object.keys(patterns) as Array<DecimalFormatNum>
  const result = {} as Record<DecimalFormatNum, string>
  for (const t of compactThresholds) {
    const pattern = patterns[t] || ''
    const compactUnit = pattern.replace(/[¤0]/g, '')
      // In case we're processing half-processed things
      .replace(/({\w+})/g, '')
      .trim();
    result[t] = compactUnit ? pattern.replace(compactUnit, `{${slotToken}}`) : pattern
  }
  return result
}

function extractSignPatternForCompact(patterns: Record<DecimalFormatNum, string>, compactType: 'compactShort' | 'compactLong'): SignDisplayPattern {
  const compactThresholds = Object.keys(patterns) as Array<DecimalFormatNum>
  const result = {
    auto: {},
    always: {},
    never: {},
    exceptZero: {}
  } as SignDisplayPattern
  for (const t of compactThresholds) {
    const pattern = patterns[t]
    const signPattern = extractSignPattern(pattern)
    for (const s of Object.keys(signPattern)) {
      result[s as 'auto'][compactType][t] = signPattern[s as 'auto']
    }
  }
  return result
}

function extractDecimalPattern(
  d: RawNumberData,
  numberingSystem: string
): SignDisplayPattern {
  const rawCompactShortSignPattern = extractCompactSignPattern(aggregateLDMLOther(d.decimal[numberingSystem].short))
  const compactShortSignPattern = extractSignPatternForCompact(rawCompactShortSignPattern, 'compactShort')
  const rawCompactLongSignPattern = extractCompactSignPattern(
    aggregateLDMLOther(d.decimal[numberingSystem].long),
    InternalSlotToken.compactName
  )
  const compactLongSignPattern = extractSignPatternForCompact(rawCompactLongSignPattern, 'compactLong')
    
  return SIGN_DISPLAYS.reduce((all: SignDisplayPattern, k) => {
    all[k] = {
      standard: dummySignPattern[k],
      scientific: scientificSignPattern[k],
      compactShort: compactShortSignPattern[k].compactShort,
      compactLong: compactLongSignPattern[k].compactLong
    };
    return all;
  }, {} as SignDisplayPattern);
}

function extractPercentPattern(
  d: RawNumberData,
  numberingSystem: string
): SignDisplayPattern<PercentNotationPattern> {
  const percentSignPattern = extractSignPattern(d.percent[numberingSystem]);
  const scientificPercentSignPattern = extractSignPattern(
    d.percent[numberingSystem].replace(NUMBER_PATTERN, SCIENTIFIC_SLOT)
  );
  return SIGN_DISPLAYS.reduce((all, k) => {
    all[k] = {
      standard: percentSignPattern[k],
      scientific: scientificPercentSignPattern[k],
    };
    return all;
  }, {} as SignDisplayPattern<PercentNotationPattern>);
}

const INSERT_BEFORE_PATTERN_REGEX = /[^\s(]¤/;
const INSERT_AFTER_PATTERN_REGEX = /¤[^\s;]/;
const S_UNICODE_REGEX = /\p{S}/u;

function shouldInsertBefore(currency: string, pattern: string) {
  // surroundingMatch [:digit:] check
  return (
    INSERT_BEFORE_PATTERN_REGEX.test(pattern) &&
    // [:^S:]
    !S_UNICODE_REGEX.test(currency[0])
  );
}

function shouldInsertAfter(currency: string, pattern: string) {
  return (
    INSERT_AFTER_PATTERN_REGEX.test(pattern) &&
    // [:^S:]
    !S_UNICODE_REGEX.test(currency[currency.length - 1])
  );
}

const DUMMY_COMPACT_LDML_RULE_MAP: LDMLPluralRuleMap<string> = {other: '0'}
const DUMMY_COMPACT_PATTERN: Record<DecimalFormatNum, LDMLPluralRuleMap<string>> = {
  '1000': DUMMY_COMPACT_LDML_RULE_MAP,
  '10000': DUMMY_COMPACT_LDML_RULE_MAP,
  '100000': DUMMY_COMPACT_LDML_RULE_MAP,
  '1000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '10000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '100000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '1000000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '10000000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '100000000000': DUMMY_COMPACT_LDML_RULE_MAP, 
  '1000000000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '10000000000000': DUMMY_COMPACT_LDML_RULE_MAP,
  '100000000000000': DUMMY_COMPACT_LDML_RULE_MAP,
}

/**
 *
 * @param currencyUnitPattern
 * @param decimalShortPattern
 * @param decimalLongPattern
 * @param currencyToken
 */
function extractStandardCurrencyPattern(
  currencyStandardPattern: string,
  currencyUnitPattern: string,
  currencyShortPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  decimalShortPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  decimalLongPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  currencyDisplay: keyof CurrencyPattern
) {
  let standardPattern: string;
  let scientificPattern: string;
  let compactShortPattern: SignDisplayPattern;
  let compactLongPattern: SignDisplayPattern;

  // {0} {1} -> {0} {unitSymbol}
  const unitPatternWithToken = currencyUnitPattern.replace('{1}', `{${InternalSlotToken.currencyName}}`)

  let rawCompactShortSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(decimalShortPatterns))
  rawCompactShortSignPattern = (Object.keys(rawCompactShortSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactShortSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)

  let rawCompactLongSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(decimalLongPatterns))
  rawCompactLongSignPattern = (Object.keys(rawCompactLongSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactLongSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)
  const rawCurrencyShortSignPattern = extractCompactSignPattern(aggregateLDMLOther(currencyShortPatterns))
  
  // For full currency name, we use unitPattern in conjunction with
  // decimal short/long pattern, so
  // `{0} {1}` + `0 thousand` -> `0 thousand {1}` -> {number} {compactName} {currencyName}`
  if (currencyDisplay === 'name') {
    standardPattern = unitPatternWithToken.replace('{0}', DUMMY_PATTERN);
    scientificPattern = unitPatternWithToken.replace('{0}', SCIENTIFIC_SLOT);
    
    compactShortPattern = extractSignPatternForCompact(rawCompactShortSignPattern, 'compactShort')
    
    compactLongPattern = extractSignPatternForCompact(rawCompactShortSignPattern, 'compactLong')
  }
  // For currency symbol/code, it's trickier
  // standard uses the currency standard pattern
  // scientific uses the currency standard pattern but replace digits w/ scientific pattern
  // short uses currency short pattern, otherwise nothing
  // long uses currency long pattern, otherwise short, otherwise nothing
  else {
    standardPattern = currencyStandardPattern;
    scientificPattern = currencyStandardPattern.replace(
      NUMBER_PATTERN,
      SCIENTIFIC_SLOT
    );
    compactShortPattern = extractSignPatternForCompact(rawCurrencyShortSignPattern, 'compactShort');
    compactLongPattern = extractSignPatternForCompact(rawCurrencyShortSignPattern, 'compactLong');
  }
  return SIGN_DISPLAYS.reduce((all: SignDisplayPattern, signDisplay) => {
    all[signDisplay] = {
      standard: extractSignPattern(standardPattern)[signDisplay],
      scientific: extractSignPattern(scientificPattern)[signDisplay],
      compactShort: compactShortPattern[signDisplay].compactShort,
      compactLong: compactLongPattern[signDisplay].compactLong,
    };
    return all;
  }, {} as SignDisplayPattern);
}

function extractAccountingCurrencyPattern(
  currencyAccountingPattern: string,
  currencyUnitPattern: string,
  currencyShortPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  decimalShortPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  decimalLongPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  currencyDisplay: keyof CurrencyPattern
) {
  let standardPattern: string;
  let scientificPattern: string;
  let compactShortPattern: SignDisplayPattern;
  let compactLongPattern: SignDisplayPattern;

  // {0} {1} -> {0} {unitSymbol}
  const unitPatternWithToken = currencyUnitPattern.replace('{1}', `{${InternalSlotToken.currencyName}}`)

  let rawCompactShortSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(decimalShortPatterns))
  rawCompactShortSignPattern = (Object.keys(rawCompactShortSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactShortSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)
  let rawCompactLongSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(decimalLongPatterns))
  rawCompactLongSignPattern = (Object.keys(rawCompactLongSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactLongSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)
  const rawCurrencyShortSignPattern = extractCompactSignPattern(aggregateLDMLOther(currencyShortPatterns))

  // For full currency name, we use unitPattern in conjunction with
  // decimal short/long pattern, so
  // `{0} {1}` + `0 thousand` -> `0 thousand {1}` -> {number} {compactName} {currencyName}`
  if (currencyDisplay === 'name') {
    standardPattern = unitPatternWithToken.replace('{0}', DUMMY_PATTERN);
    scientificPattern = unitPatternWithToken.replace('{0}', SCIENTIFIC_SLOT);
    
    compactShortPattern = extractSignPatternForCompact(rawCompactShortSignPattern, 'compactShort')
    compactLongPattern = extractSignPatternForCompact(rawCompactLongSignPattern, 'compactLong')
  }
  // For currency symbol/code, it's trickier
  // standard uses the currency accounting pattern
  // scientific uses the currency accounting pattern but replace digits w/ scientific pattern
  // short uses currency short pattern, otherwise nothing
  // long uses currency long pattern, otherwise short, otherwise nothing
  else {
    standardPattern = currencyAccountingPattern;
    scientificPattern = currencyAccountingPattern.replace(
      NUMBER_PATTERN,
      SCIENTIFIC_SLOT
    );
    compactShortPattern = extractSignPatternForCompact(rawCurrencyShortSignPattern, 'compactShort');
    compactLongPattern = extractSignPatternForCompact(rawCurrencyShortSignPattern, 'compactLong');
  }
  return SIGN_DISPLAYS.reduce((all: SignDisplayPattern, signDisplay) => {
    all[signDisplay] = {
      standard: extractSignPattern(standardPattern)[signDisplay],
      scientific: extractSignPattern(scientificPattern)[signDisplay],
      compactShort: compactShortPattern[signDisplay].compactShort,
      compactLong: compactLongPattern[signDisplay].compactLong
    };
    return all;
  }, {} as SignDisplayPattern);
}


function replaceCurrencySymbolWithToken(
  currency: string,
  pattern: string,
  insertBetween: string,
  currencyToken: InternalSlotToken
): string {
  
    // Check afterCurrency
  if (shouldInsertAfter(currency, pattern)) {
    return pattern.replace(
      CURRENCY_SYMBOL_REGEX,
      `{${currencyToken}}${insertBetween}`
    );
  }

  // Check beforeCurrency
  if (shouldInsertBefore(currency, pattern)) {
    return pattern.replace(
      CURRENCY_SYMBOL_REGEX,
      `${insertBetween}{${currencyToken}}`
    );
  }
    return pattern.replace(CURRENCY_SYMBOL_REGEX, `{${currencyToken}}`);
}

function replaceCurrencyCompactSymbolWithToken(
  currency: string,
  patterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  insertBetween: string,
  currencyToken: InternalSlotToken
): Record<DecimalFormatNum, LDMLPluralRuleMap<string>> {
  return (Object.keys(patterns) as Array<DecimalFormatNum>).reduce((all, num) => {
    const patternRule = patterns[num]
    all[num] = (Object.keys(patternRule) as Array<LDMLPluralRule>).reduce((all, ldml) => {
      all[ldml] = replaceCurrencySymbolWithToken(currency, patternRule[ldml]!, insertBetween, currencyToken)
      return all
    }, {} as LDMLPluralRuleMap<string>) 
    return all
  }, {} as Record<DecimalFormatNum, LDMLPluralRuleMap<string>>)
}

function extractCurrencyPatternForCurrency(
  d: RawNumberData,
  c: Record<string, CurrencyData>,
  currency: string,
  numberingSystem: string
): CurrencyPattern {
  const insertBetween =
    d.currency[numberingSystem].currencySpacing.beforeInsertBetween;
  const currencyStandardPattern = d.currency[numberingSystem].standard;
  const currencyUnitPattern = d.currency[numberingSystem].unitPattern;
  const currencyAccountingPattern = d.currency[numberingSystem].accounting;
  const currencyShortPatterns =
    d.currency[numberingSystem].short || DUMMY_COMPACT_PATTERN;
  const decimalShortPatterns =
    d.decimal[numberingSystem].short;
  const decimalLongPatterns =
    d.decimal[numberingSystem].long;
  const currencySymbol = c[currency].symbol;
  const currencyNarrowSymbol = c[currency].narrow;
  const standardCurrencyPattern = {
    standard: extractStandardCurrencyPattern(
      currencyStandardPattern,
      currencyUnitPattern,
      currencyShortPatterns,
      decimalShortPatterns,
      decimalLongPatterns,
      'name'
    ),
    accounting: extractAccountingCurrencyPattern(
      currencyAccountingPattern,
      currencyUnitPattern,
      currencyShortPatterns,
      decimalShortPatterns,
      decimalLongPatterns,
      'name'
    ),
  };

  return CURRENCY_DISPLAYS.reduce((all: CurrencyPattern, currencyDisplay) => {
    if (currencyDisplay === 'name') {
      all[currencyDisplay] = standardCurrencyPattern;
    } else {
      const currencyToken =
        currencyDisplay === 'code'
          ? InternalSlotToken.currencyCode
          : currencyDisplay === 'symbol'
          ? InternalSlotToken.currencySymbol
          : InternalSlotToken.currencyNarrowSymbol;
      const resolvedCurrency: string =
        currencyDisplay === 'code'
          ? currency
          : currencyDisplay === 'symbol'
          ? currencySymbol
          : currencyNarrowSymbol;
      all[currencyDisplay] = {
        standard: extractStandardCurrencyPattern(
          replaceCurrencySymbolWithToken(
            resolvedCurrency,
            currencyStandardPattern,
            insertBetween,
            currencyToken
          ),
          currencyUnitPattern,
          replaceCurrencyCompactSymbolWithToken(
            resolvedCurrency,
            currencyShortPatterns,
            insertBetween,
            currencyToken
          ),
          decimalShortPatterns,
          decimalLongPatterns,
          currencyDisplay
        ),
        accounting: extractAccountingCurrencyPattern(
          replaceCurrencySymbolWithToken(
            resolvedCurrency,
            currencyAccountingPattern,
            insertBetween,
            currencyToken
          ),
          currencyUnitPattern,
          replaceCurrencyCompactSymbolWithToken(
            resolvedCurrency,
            currencyShortPatterns,
            insertBetween,
            currencyToken
          ),
          decimalShortPatterns,
          decimalLongPatterns,
          currencyDisplay
        ),
      };
    }
    return all;
  }, {} as CurrencyPattern);
}

function generateUnitPatternPayload(
  unitPatternStr: string,
  display: keyof UnitPattern,
  compactShortDecimalPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>,
  compactLongDecimalPatterns: Record<DecimalFormatNum, LDMLPluralRuleMap<string>>
) {
  const unitToken =
    display === 'long'
      ? InternalSlotToken.unitName
      : display === 'short'
      ? InternalSlotToken.unitSymbol
      : InternalSlotToken.unitNarrowSymbol;
  // {0} {1} -> {0} {unitSymbol}
  const unitPatternWithToken = unitPatternStr.replace('{1}', `{${unitToken}}`)

  const standardUnitPatternStr = unitPatternWithToken.replace('{0}', DUMMY_PATTERN)
  const scientificUnitPatternStr = unitPatternWithToken.replace('{0}', SCIENTIFIC_SLOT)

  let rawCompactShortSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(compactShortDecimalPatterns))
  rawCompactShortSignPattern = (Object.keys(rawCompactShortSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactShortSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)
  const compactShortSignPattern = extractSignPatternForCompact(rawCompactShortSignPattern, 'compactShort')
  
  let rawCompactLongSignPattern: Record<DecimalFormatNum, string> = extractCompactSignPattern(aggregateLDMLOther(compactLongDecimalPatterns))
  rawCompactLongSignPattern = (Object.keys(rawCompactLongSignPattern) as Array<DecimalFormatNum>).reduce((all, k) => {
    all[k] = unitPatternWithToken.replace('{0}', rawCompactLongSignPattern[k]) 
    return all
  }, {} as Record<DecimalFormatNum, string>)
  const compactLongSignPattern = extractSignPatternForCompact(rawCompactLongSignPattern, 'compactLong')

  const standard = extractSignPattern(standardUnitPatternStr);
  const scientific = extractSignPattern(scientificUnitPatternStr);
  return SIGN_DISPLAYS.reduce((all: SignDisplayPattern, k) => {
    all[k] = {
      standard: standard[k],
      scientific: scientific[k],
      compactShort: compactShortSignPattern[k].compactShort,
      compactLong: compactLongSignPattern[k].compactLong,
    };
    return all;
  }, {} as SignDisplayPattern);
}

function extractUnitPatternForUnit(
  d: RawNumberData,
  u: Record<string, UnitData>,
  unit: string,
  numberingSystem: string
): UnitPattern {
  const unitData = u[unit];
  const patterns = {} as UnitPattern;
  for (const unitDisplay of UNIT_DISPLAYS) {
    patterns[unitDisplay] = generateUnitPatternPayload(
      unitData[unitDisplay].other.pattern,
      unitDisplay,
      d.decimal[numberingSystem].short,
      d.decimal[numberingSystem].long
    );
  }
  return patterns;
}

function generateContinuousILND(startChar: string): string[] {
  const startCharCode = startChar.charCodeAt(0);
  const arr = new Array<string>(10);
  for (let i = 0; i < 10; i++) {
    arr[i] = String.fromCharCode(startCharCode + i);
  }
  return arr;
}

// https://tc39.es/proposal-unified-intl-numberformat/section11/numberformat_proposed_out.html#table-numbering-system-digits
export const ILND: Record<string, string[]> = (function() {
  return {
    arab: generateContinuousILND('\u0660'),
    arabext: generateContinuousILND('\u06f0'),
    bali: generateContinuousILND('\u1b50'),
    beng: generateContinuousILND('\u09e6'),
    deva: generateContinuousILND('\u0966'),
    fullwide: generateContinuousILND('\uff10'),
    gujr: generateContinuousILND('\u0ae6'),
    guru: generateContinuousILND('\u0a66'),
    khmr: generateContinuousILND('\u17e0'),
    knda: generateContinuousILND('\u0ce6'),
    laoo: generateContinuousILND('\u0ed0'),
    latn: generateContinuousILND('\u0030'),
    limb: generateContinuousILND('\u1946'),
    mlym: generateContinuousILND('\u0d66'),
    mong: generateContinuousILND('\u1810'),
    mymr: generateContinuousILND('\u1040'),
    orya: generateContinuousILND('\u0b66'),
    tamldec: generateContinuousILND('\u0be6'),
    telu: generateContinuousILND('\u0c66'),
    thai: generateContinuousILND('\u0e50'),
    tibt: generateContinuousILND('\u0f20'),
    hanidec: [
      '\u3007',
      '\u4e00',
      '\u4e8c',
      '\u4e09',
      '\u56db',
      '\u4e94',
      '\u516d',
      '\u4e03',
      '\u516b',
      '\u4e5d',
    ],
  };
})();

export function extractPatterns(
  units: Record<string, UnitData>,
  currencies: Record<string, CurrencyData>,
  numbers: RawNumberData,
  numberingSystem: string,
  unit?: string,
  currency?: string
): NumberLocalePatternData {
  return {
    decimal: extractDecimalPattern(numbers, numberingSystem),
    percent: extractPercentPattern(numbers, numberingSystem),
    unit: unit
      ? {
          [unit]: extractUnitPatternForUnit(
            numbers,
            units,
            unit,
            numberingSystem
          ),
        }
      : {},
    currency: currency
      ? {
          [currency]: extractCurrencyPatternForCurrency(
            numbers,
            currencies,
            currency,
            numberingSystem
          ),
        }
      : {},
  };
}
