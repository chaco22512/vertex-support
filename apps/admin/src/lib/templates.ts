// Reply templates (§7.3): common greetings/closings per customer language.
// Staff insert these into the reply box, then edit before sending (Hard rule 4).
export interface Template {
  label: string;
  text: string;
}

type ByLang = Record<string, Template[]>;

const GREETINGS: ByLang = {
  en: [{ label: 'Greeting', text: 'Hi, thanks for reaching out to SIM Point Support.\n\n' }],
  id: [{ label: 'Greeting', text: 'Halo, terima kasih telah menghubungi SIM Point Support.\n\n' }],
  tl: [{ label: 'Greeting', text: 'Kumusta, salamat sa pakikipag-ugnayan sa SIM Point Support.\n\n' }],
  ne: [{ label: 'Greeting', text: 'नमस्ते, SIM Point Support मा सम्पर्क गर्नुभएकोमा धन्यवाद।\n\n' }],
  vi: [{ label: 'Greeting', text: 'Xin chào, cảm ơn bạn đã liên hệ SIM Point Support.\n\n' }],
};

const CLOSINGS: ByLang = {
  en: [{ label: 'Closing', text: '\n\nPlease let us know if you need anything else.\nSIM Point Support' }],
  id: [{ label: 'Closing', text: '\n\nBeri tahu kami jika Anda butuh bantuan lain.\nSIM Point Support' }],
  tl: [{ label: 'Closing', text: '\n\nIpaalam lang kung may iba pa kayong kailangan.\nSIM Point Support' }],
  ne: [{ label: 'Closing', text: '\n\nथप केही चाहिएमा हामीलाई भन्नुहोस्।\nSIM Point Support' }],
  vi: [{ label: 'Closing', text: '\n\nHãy cho chúng tôi biết nếu bạn cần thêm hỗ trợ.\nSIM Point Support' }],
};

export function templatesFor(language: string): Template[] {
  const g = GREETINGS[language] ?? GREETINGS.en ?? [];
  const c = CLOSINGS[language] ?? CLOSINGS.en ?? [];
  return [...g, ...c];
}
