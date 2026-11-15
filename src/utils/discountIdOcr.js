const normalizeOcrText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const discountCategoryAliases = {
  student: ['student', 'students'],
  senior: ['senior', 'osca'],
  pwd: ['pwd', 'disability', 'disabilities', 'disabled'],
};

const levenshteinDistance = (left, right) => {
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    let diagonal = previousRow[0];
    previousRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const previous = previousRow[rightIndex + 1];
      previousRow[rightIndex + 1] = Math.min(
        previousRow[rightIndex + 1] + 1,
        previousRow[rightIndex] + 1,
        diagonal + (left[leftIndex] === right[rightIndex] ? 0 : 1)
      );
      diagonal = previous;
    }
  }

  return previousRow[right.length];
};

const isOcrTokenMatch = (token, keyword) =>
  token === keyword || (keyword.length >= 5 && levenshteinDistance(token, keyword) <= 1);

const containsOcrPhrase = (text, phrase) => {
  const tokens = normalizeOcrText(text).split(/\s+/).filter(Boolean);
  const phraseTokens = normalizeOcrText(phrase).split(/\s+/).filter(Boolean);
  if (!tokens.length || !phraseTokens.length) return false;

  return tokens.some((token, startIndex) =>
    phraseTokens.every(
      (phraseToken, offset) =>
        tokens[startIndex + offset] &&
        isOcrTokenMatch(tokens[startIndex + offset], phraseToken)
    )
  );
};

const containsAnyOcrKeyword = (text, keywords) => {
  const tokens = normalizeOcrText(text).split(/\s+/).filter(Boolean);
  return tokens.some((token) =>
    keywords.some((keyword) => isOcrTokenMatch(token, keyword))
  );
};

const getDiscountCategory = (discountType) => {
  const type = normalizeOcrText(discountType).replace(/\s+/g, '');
  if (type.includes('student')) return 'student';
  if (type.includes('senior') || type.includes('osca')) return 'senior';
  if (type === 'pwd' || type.includes('disability')) return 'pwd';
  return null;
};

export const getDiscountIdAdditionalFields = (discountType) => {
  const category = getDiscountCategory(discountType);
  if (category === 'student') {
    return [
      { key: 'fullName', label: 'Full Name', placeholder: 'Enter full name' },
      { key: 'idNumber', label: 'Student Number', placeholder: 'Enter student number' },
      { key: 'issuer', label: 'School Name', placeholder: 'Enter school name' },
    ];
  }
  if (category === 'senior') {
    return [
      { key: 'fullName', label: 'Full Name', placeholder: 'Enter full name' },
      {
        key: 'idNumber',
        label: 'Senior Citizen ID Number',
        placeholder: 'Enter senior citizen ID number',
      },
    ];
  }
  if (category === 'pwd') {
    return [
      { key: 'fullName', label: 'Full Name', placeholder: 'Enter full name' },
      { key: 'idNumber', label: 'PWD ID Number', placeholder: 'Enter PWD ID number' },
      {
        key: 'issuer',
        label: 'Issuing City/Municipality',
        placeholder: 'Enter issuing city or municipality',
      },
    ];
  }
  return [];
};

export const identifyDiscountCategoryFromOcr = (ocrText) => {
  const text = normalizeOcrText(ocrText);
  if (!text) return null;

  const matchedCategories = Object.entries(discountCategoryAliases)
    .filter(([category, aliases]) =>
      aliases.some((alias) => containsAnyOcrKeyword(text, [alias])) ||
      (category === 'student' &&
        (containsOcrPhrase(text, 'school id') ||
          containsOcrPhrase(text, 'school identification'))) ||
      (category === 'pwd' &&
        (containsOcrPhrase(text, 'person with disability') ||
          containsOcrPhrase(text, 'persons with disability') ||
          containsOcrPhrase(text, 'person with disabilities') ||
          containsOcrPhrase(text, 'persons with disabilities')))
    )
    .map(([category]) => category);

  return matchedCategories.length === 1 ? matchedCategories[0] : null;
};

const getOcrLines = (ocrText) =>
  String(ocrText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const getLabeledValue = (lines, labelPattern) => {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(labelPattern);
    if (!match) continue;

    const value = (match[1] || lines[index + 1] || '')
      .split(/\b(?:id\s*(?:no|number)|student\s*(?:no|number)|card\s*(?:no|number)|issued\s*by|date\s*of\s*birth|dob)\b/i)[0]
      .replace(/^[\s:#-]+|[\s|]+$/g, '')
      .trim();
    if (value) return value;
  }

  return '';
};

const cleanName = (value) =>
  String(value || '')
    .replace(/\b(?:name|id|number|no|student|senior|citizen|pwd|date|birth|dob)\b.*$/i, '')
    .replace(/[^a-zA-Z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyOrganization = (value) =>
  /\b(?:university|college|school|institute|department|office|municipality|city|barangay|authority|foundation|academy)\b/i.test(
    value
  );

const extractName = (lines) => {
  const labeledName = getLabeledValue(
    lines,
    /\b(?:full\s*name|cardholder(?:'s)?\s*name|student\s*name|name)\b\s*[:#-]?\s*(.*)/i
  );
  if (labeledName) return cleanName(labeledName);

  const candidate = lines.find(
    (line) =>
      /^[A-Z][A-Z\s.'-]{4,}$/i.test(line) &&
      line.trim().split(/\s+/).length >= 2 &&
      !isLikelyOrganization(line) &&
      !/\b(?:student|senior|citizen|disability|identification|expiry|expiration|valid|issued|office|school|university|college|id|card)\b/i.test(
        line
      )
  );
  return candidate ? cleanName(candidate) : '';
};

const extractIdNumber = (lines) => {
  const labeledId = getLabeledValue(
    lines,
    /\b(?:(?:student|card|membership|registration)\s*)?(?:id\s*)?(?:no\.?|number|#)\b\s*[:#-]?\s*(.*)/i
  );
  if (labeledId) return labeledId.replace(/\s+/g, '').toUpperCase();

  const candidate = lines.find(
    (line) =>
      /\d/.test(line) &&
      /[a-z0-9][a-z0-9-]{4,}/i.test(line) &&
      !/\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b/.test(line) &&
      !/\b(?:birth|born|expiry|expiration|valid until|date of birth|dob|phone|mobile|contact|telephone|postal|zip)\b/i.test(
        line
      )
  );
  return candidate?.match(/[a-z0-9][a-z0-9-]{4,}/i)?.[0]?.toUpperCase() || '';
};

const extractExpirationDate = (lines) => {
  const datePattern =
    /\b(?:\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|\d{4}[/-]\d{1,2}[/-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;
  const labeledLine = lines.find((line) =>
    /\b(?:exp(?:iry|iration)?|valid\s*(?:until|thru|through))\b/i.test(line)
  );
  return labeledLine?.match(datePattern)?.[0] || '';
};

const extractIssuer = (lines) => {
  const labeledIssuer = getLabeledValue(
    lines,
    /\b(?:issued\s*by|issuing\s*(?:office|organization|authority|city(?:\s*\/\s*municipality)?|municipality)|school(?:\s*name)?|university|college|organization)\b\s*[:#-]?\s*(.*)/i
  );
  if (labeledIssuer) return labeledIssuer;
  return lines.find((line) => isLikelyOrganization(line)) || '';
};

const extractIdType = (lines, detectedCategory) => {
  const labeledType = getLabeledValue(
    lines,
    /\b(?:id\s*type|type\s*of\s*id|identification\s*type)\b\s*[:#-]?\s*(.*)/i
  );
  if (labeledType) return labeledType;

  if (detectedCategory === 'student') return 'Student ID';
  if (detectedCategory === 'senior') return 'Senior Citizen ID';
  if (detectedCategory === 'pwd') return 'PWD ID';
  return /\b(?:identification\s*card|id\s*card)\b/i.test(lines.join(' '))
    ? 'Identification Card'
    : '';
};

export const extractDiscountIdDetails = (ocrText) => {
  const lines = getOcrLines(ocrText);
  const detectedCategory = identifyDiscountCategoryFromOcr(ocrText);

  return {
    name: extractName(lines),
    idNumber: extractIdNumber(lines),
    issuer: extractIssuer(lines),
    idType: extractIdType(lines, detectedCategory),
    expirationDate: extractExpirationDate(lines),
    detectedCategory,
  };
};

const normalizeNameParts = (name) =>
  normalizeOcrText(name)
    .split(/\s+/)
    .filter(
      (part) =>
        Boolean(part) &&
        !['jr', 'sr', 'ii', 'iii', 'iv', 'v'].includes(part)
    )
    .sort();

export const comparePassengerNames = (idName, registeredName) => {
  const idNameParts = normalizeNameParts(idName);
  const registeredNameParts = normalizeNameParts(registeredName);
  if (idNameParts.length < 2 || registeredNameParts.length < 2) return null;

  const [shorterName, longerName] =
    idNameParts.length <= registeredNameParts.length
      ? [idNameParts, registeredNameParts]
      : [registeredNameParts, idNameParts];

  const unmatchedLongerParts = [...longerName];
  return shorterName.every((part) => {
    const matchingIndex = unmatchedLongerParts.findIndex(
      (candidate) =>
        candidate === part ||
        (part.length === 1 && candidate.startsWith(part)) ||
        (candidate.length === 1 && part.startsWith(candidate))
    );
    if (matchingIndex < 0) return false;
    unmatchedLongerParts.splice(matchingIndex, 1);
    return true;
  });
};

export const hasRequiredDiscountIdDetails = (details) =>
  normalizeNameParts(details?.name).length >= 2 && Boolean(details?.idNumber);

const normalizeIdentifier = (value) => normalizeOcrText(value).replace(/\s+/g, '');

const compareIssuer = (ocrIssuer, enteredIssuer) => {
  const ocrTokens = normalizeOcrText(ocrIssuer)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['the', 'and'].includes(token));
  const enteredTokens = normalizeOcrText(enteredIssuer)
    .split(/\s+/)
    .filter((token) =>
      token.length > 2 &&
      !['the', 'and', 'university', 'college', 'school', 'city', 'municipality'].includes(token)
    );
  return (
    ocrTokens.length > 0 &&
    enteredTokens.length > 0 &&
    enteredTokens.every((token) => ocrTokens.includes(token))
  );
};

export const getMissingDiscountIdDetails = (details, discountType) => {
  const category = getDiscountCategory(discountType);
  const missingDetails = [];
  if (normalizeNameParts(details?.name).length < 2) missingDetails.push('name');
  if (!details?.idNumber) missingDetails.push('ID number');
  if (['student', 'pwd'].includes(category) && !details?.issuer) {
    missingDetails.push(category === 'student' ? 'school name' : 'issuing city/municipality');
  }
  return missingDetails;
};

export const hasReadableDiscountIdDetails = (details, discountType) => {
  const category = getDiscountCategory(discountType);
  return Boolean(
    normalizeNameParts(details?.name).length >= 2 ||
      details?.idNumber ||
      (['student', 'pwd'].includes(category) && details?.issuer)
  );
};

export const isDiscountIdEligible = (details, providedInfo, discountType) => {
  const selectedCategory = getDiscountCategory(discountType);
  const additionalFields = getDiscountIdAdditionalFields(discountType);
  if (!selectedCategory || !additionalFields.length) return false;
  if (details?.detectedCategory && details.detectedCategory !== selectedCategory) return false;
  const requiresIssuer = additionalFields.some((field) => field.key === 'issuer');
  const matchedName =
    Boolean(details?.name && providedInfo?.fullName) &&
    comparePassengerNames(details.name, providedInfo.fullName) === true;
  const matchedIdNumber =
    Boolean(details?.idNumber && providedInfo?.idNumber) &&
    normalizeIdentifier(details.idNumber) === normalizeIdentifier(providedInfo.idNumber);
  const matchedIssuer =
    requiresIssuer &&
    Boolean(details?.issuer && providedInfo?.issuer) &&
    compareIssuer(details.issuer, providedInfo.issuer);

  return matchedName || matchedIdNumber || matchedIssuer;
};

export const isDiscountTypeVisibleInOcr = (ocrText, discountType) => {
  const text = normalizeOcrText(ocrText);
  const type = normalizeOcrText(discountType);
  if (!text || !type) return false;

  const category = getDiscountCategory(type);
  if (category) return identifyDiscountCategoryFromOcr(text) === category;

  return containsOcrPhrase(text, type);
};
