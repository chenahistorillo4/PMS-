import {
  comparePassengerNames,
  extractDiscountIdDetails,
  getDiscountIdAdditionalFields,
  getMissingDiscountIdDetails,
  hasReadableDiscountIdDetails,
  hasRequiredDiscountIdDetails,
  identifyDiscountCategoryFromOcr,
  isDiscountIdEligible,
  isDiscountTypeVisibleInOcr,
} from './discountIdOcr';

describe('isDiscountTypeVisibleInOcr', () => {
  test.each([
    ['STUDENT ID', 'student'],
    ["STUDENT'S IDENTIFICATION CARD", 'student'],
    ['STUDENI IDENTIFICATION CARD', 'student'],
    ['SCHOOL IDENTIFICATION CARD', 'student'],
    ['OSCA SENIOR CITIZEN', 'senior citizen'],
    ['SENI0R CITIZEN CARD', 'senior citizen'],
    ['PERSON WITH DISABILITY', 'PWD'],
    ['PERSONS WITH DISABILITIES', 'PWD'],
    ['PWD ID', 'PWD'],
  ])('recognizes %s as %s', (text, discountType) => {
    expect(isDiscountTypeVisibleInOcr(text, discountType)).toBe(true);
  });

  test('does not verify a mismatched or empty ID', () => {
    expect(isDiscountTypeVisibleInOcr('STUDENT ID', 'senior citizen')).toBe(false);
    expect(isDiscountTypeVisibleInOcr('', 'student')).toBe(false);
    expect(isDiscountTypeVisibleInOcr('STUDENT ID', '')).toBe(false);
  });

  test.each([
    ['STUDENT ID', 'student'],
    ["STUDENT'S IDENTIFICATION CARD", 'student'],
    ['STUDENI IDENTIFICATION CARD', 'student'],
    ['OFFICE OF SENIOR CITIZEN AFFAIRS (OSCA)', 'senior'],
    ['SENI0R CITIZEN CARD', 'senior'],
    ['PERSON WITH DISABILITY ID', 'pwd'],
    ['PERSONS WITH DISABILITIES ID', 'pwd'],
    ['Unrelated card text', null],
    ['STUDENT PWD ID', null],
  ])('identifies the category in OCR text %s', (text, category) => {
    expect(identifyDiscountCategoryFromOcr(text)).toBe(category);
  });

  test('extracts ID details even when the discount category keyword is absent', () => {
    const details = extractDiscountIdDetails(
      'Name: Maria Clara Santos\nID Number: AB-123456\nSchool: Marinduque State University\nID Type: Library Card\nExpiry Date: 12/31/2027'
    );

    expect(details).toEqual({
      name: 'Maria Clara Santos',
      idNumber: 'AB-123456',
      issuer: 'Marinduque State University',
      idType: 'Library Card',
      expirationDate: '12/31/2027',
      detectedCategory: null,
    });
    expect(hasRequiredDiscountIdDetails(details)).toBe(true);
  });

  test('compares ID name with the registered name regardless of word order', () => {
    expect(comparePassengerNames('SANTOS, MARIA CLARA', 'Maria Clara Santos')).toBe(true);
    expect(comparePassengerNames('Maria C. Santos', 'Maria Clara Santos')).toBe(true);
    expect(comparePassengerNames('Maria Santos', 'Maria Clara Santos')).toBe(true);
    expect(comparePassengerNames('CHENA MAE F. HISTORILLO', 'Chena Historillo')).toBe(true);
    expect(comparePassengerNames('Maria Santos', 'Maria Lopez')).toBe(false);
    expect(comparePassengerNames('Maria Santos', '')).toBe(null);
    expect(comparePassengerNames('Maria', 'Maria Santos')).toBe(null);
  });

  test('accepts a single matching detail when no conflicting category is detected', () => {
    const details = {
      name: 'Maria Clara Santos',
      idNumber: 'AB-123456',
      detectedCategory: null,
    };

    expect(
      isDiscountIdEligible(
        details,
        { fullName: 'Maria Clara Santos', idNumber: 'DIFFERENT', issuer: 'Different School' },
        'student'
      )
    ).toBe(true);
    expect(
      isDiscountIdEligible(
        { ...details, detectedCategory: 'senior' },
        { fullName: 'Maria Clara Santos', idNumber: 'AB-123456', issuer: 'Marinduque State University' },
        'student'
      )
    ).toBe(false);
    expect(
      isDiscountIdEligible(
        {
          ...details,
          name: 'Someone Else',
          idNumber: 'DIFFERENT',
          issuer: 'Marinduque State University',
        },
        {
          fullName: 'Maria Clara Santos',
          idNumber: 'AB-123456',
          issuer: 'Marinduque State University',
        },
        'student'
      )
    ).toBe(true);
    expect(
      isDiscountIdEligible(
        {
          ...details,
          idNumber: 'DIFFERENT',
          issuer: 'Different School',
          nameMatch: false,
        },
        {
          fullName: 'Maria Clara Santos',
          idNumber: 'DIFFERENT',
          issuer: 'Different School',
        },
        'student'
      )
    ).toBe(true);
  });

  test('accepts one matching ID number or issuer and attempts OCR retry only when nothing is readable', () => {
    const extracted = {
      name: '',
      idNumber: 'SC-12345',
      issuer: '',
      detectedCategory: null,
    };
    expect(hasReadableDiscountIdDetails(extracted, 'Senior Citizen')).toBe(true);
    expect(
      isDiscountIdEligible(
        extracted,
        { fullName: 'Different Name', idNumber: 'SC-12345' },
        'Senior Citizen'
      )
    ).toBe(true);

    const issuerOnly = {
      name: '',
      idNumber: '',
      issuer: 'Marinduque State University',
      detectedCategory: null,
    };
    expect(hasReadableDiscountIdDetails(issuerOnly, 'Student')).toBe(true);
    expect(
      isDiscountIdEligible(
        issuerOnly,
        {
          fullName: 'Different Name',
          idNumber: 'Different Number',
          issuer: 'Marinduque State University',
        },
        'Student'
      )
    ).toBe(true);
    expect(hasReadableDiscountIdDetails({}, 'Student')).toBe(false);
  });

  test('provides the requested additional fields for each category', () => {
    expect(getDiscountIdAdditionalFields('Student')).toEqual([
      { key: 'fullName', label: 'Full Name', placeholder: 'Enter full name' },
      { key: 'idNumber', label: 'Student Number', placeholder: 'Enter student number' },
      { key: 'issuer', label: 'School Name', placeholder: 'Enter school name' },
    ]);
    expect(getDiscountIdAdditionalFields('Senior Citizen').map(({ label }) => label)).toEqual([
      'Full Name',
      'Senior Citizen ID Number',
    ]);
    expect(getDiscountIdAdditionalFields('PWD').map(({ label }) => label)).toEqual([
      'Full Name',
      'PWD ID Number',
      'Issuing City/Municipality',
    ]);
  });

  test('accepts a single matching detail for PWD and senior IDs', () => {
    const seniorDetails = {
      name: 'Ana Reyes',
      idNumber: 'SC-12345',
      detectedCategory: null,
    };
    expect(
      isDiscountIdEligible(
        seniorDetails,
        { fullName: 'Ana Reyes', idNumber: 'SC-12345' },
        'Senior Citizen'
      )
    ).toBe(true);

    const pwdDetails = extractDiscountIdDetails(
      'Name: Ana Reyes\nID Number: 12345\nIssuing City/Municipality: Quezon City'
    );
    expect(pwdDetails.issuer).toBe('Quezon City');
    expect(pwdDetails.detectedCategory).toBe(null);
    expect(getMissingDiscountIdDetails({ ...pwdDetails, issuer: '' }, 'PWD')).toContain(
      'issuing city/municipality'
    );
    expect(
      isDiscountIdEligible(
        pwdDetails,
        { fullName: 'Ana Reyes', idNumber: '12345', issuer: 'Quezon City' },
        'PWD'
      )
    ).toBe(true);
    expect(
      isDiscountIdEligible(
        pwdDetails,
        { fullName: 'Ana Reyes', idNumber: 'DIFFERENT', issuer: 'Manila' },
        'PWD'
      )
    ).toBe(true);
    expect(
      isDiscountIdEligible(
        pwdDetails,
        { fullName: 'Different Person', idNumber: 'DIFFERENT', issuer: 'Manila' },
        'PWD'
      )
    ).toBe(false);
  });

  test('treats ID expiration as optional and reports missing required details', () => {
    const details = extractDiscountIdDetails('Name: Juan Dela Cruz\nID No: 987654321');

    expect(details.name).toBe('Juan Dela Cruz');
    expect(details.idNumber).toBe('987654321');
    expect(details.expirationDate).toBe('');
    expect(hasRequiredDiscountIdDetails(details)).toBe(true);
    expect(hasRequiredDiscountIdDetails({ name: 'Juan Dela Cruz', idNumber: '' })).toBe(false);
    expect(hasRequiredDiscountIdDetails({ name: 'Juan', idNumber: '123456' })).toBe(false);
  });

  test('keeps spaces inside a labeled ID number together', () => {
    expect(extractDiscountIdDetails('Name: Ana Reyes\nID Number: 123 456 789').idNumber).toBe(
      '123456789'
    );
  });
});
