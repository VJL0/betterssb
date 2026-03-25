const CRN_INPUT_SELECTORS = [
  'input[id^="txt_crn"]',
  'input[name*="CRN"]',
  'input[name*="crn"]',
  'input[id*="crn_id"]',
  'input.crn_id',
];

function findCRNInputs(): HTMLInputElement[] {
  for (const selector of CRN_INPUT_SELECTORS) {
    const inputs = document.querySelectorAll<HTMLInputElement>(selector);
    if (inputs.length > 0) return Array.from(inputs);
  }
  return [];
}

function findSubmitButton(): HTMLElement | null {
  const candidates = [
    document.querySelector<HTMLElement>('#saveButton'),
    document.querySelector<HTMLElement>('button[id*="submit"]'),
    document.querySelector<HTMLElement>('input[type="submit"][value*="Submit"]'),
    document.querySelector<HTMLElement>('button.btn-primary'),
  ];
  return candidates.find((el) => el !== null) ?? null;
}

function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function registerForSections(crns: string[]): Promise<void> {
  const inputs = findCRNInputs();
  if (inputs.length === 0) {
    throw new Error("No CRN input fields found on the page");
  }

  for (let i = 0; i < crns.length && i < inputs.length; i++) {
    setNativeValue(inputs[i], crns[i]);
    await new Promise((r) => setTimeout(r, 100));
  }

  if (crns.length > inputs.length) {
    console.warn(
      `[BetterSSB] Only ${inputs.length} CRN fields found, but ${crns.length} CRNs provided`
    );
  }

  const submitBtn = findSubmitButton();
  if (submitBtn) {
    submitBtn.click();
  } else {
    console.warn("[BetterSSB] Could not find submit button");
  }
}

export function initAutoRegister(): void {
  const inputs = findCRNInputs();
  if (inputs.length === 0) return;

  for (const input of inputs) {
    input.classList.add("betterssb-enhanced");
  }
}
