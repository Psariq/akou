import { describe, expect, it } from "vitest";
import { checkTranscript } from "./transcript";

// An invented page in the shape of the Centre's multimedia bank (menus, speaker codes, notes).
const page = `Τράπεζα πολυμεσικού υλικού / Δελτίο ειδήσεων Επίπεδο: Β1 Ηθοποιοί: Εκφωνήτρια [ΕΕ], Ανταποκριτής [ΑΝ]
Κείμενο [ΕΕ]: Καλησπέρα σας. Στο αποψινό δελτίο θα μιλήσουμε για τη γιορτή του κρασιού στη Ρόδο, που ξεκινά την Παρασκευή.
[μουσική] [ΑΝ]: Η γιορτή γίνεται κάθε χρόνο στο κέντρο της πόλης. Φέτος οι διοργανωτές περιμένουν περισσότερους από δέκα χιλιάδες επισκέπτες, ε… κυρίως από την Αθήνα και το εξωτερικό.
Κέντρο Ελληνικής Γλώσσας`;

const verbatim = [
  { speaker: "Εκφωνήτρια", text: "Καλησπέρα σας. Στο αποψινό δελτίο θα μιλήσουμε για τη γιορτή του κρασιού στη Ρόδο, που ξεκινά την Παρασκευή." },
  {
    speaker: "Ανταποκριτής",
    text: "Η γιορτή γίνεται κάθε χρόνο στο κέντρο της πόλης. Φέτος οι διοργανωτές περιμένουν περισσότερους από δέκα χιλιάδες επισκέπτες, ε… κυρίως από την Αθήνα και το εξωτερικό.",
  },
];

describe("transcript check for original recordings", () => {
  it("accepts the transcript copied word for word (quotes, case and punctuation don't matter)", () => {
    const c = checkTranscript(verbatim.map((s) => ({ ...s, text: s.text.replace("Η γιορτή", "η γιορτή").replace(",", " ,") })), page);
    expect(c.ok).toBe(true);
    expect(c.matched).toBe(1);
  });

  it("rejects a simplified or paraphrased transcript", () => {
    const simplified = [
      verbatim[0],
      { speaker: "Ανταποκριτής", text: "Η γιορτή γίνεται κάθε χρόνο στην πόλη. Φέτος έρχονται πάνω από δέκα χιλιάδες επισκέπτες από την Αθήνα και το εξωτερικό." },
    ];
    const c = checkTranscript(simplified, page);
    expect(c.ok).toBe(false);
    expect(c.matched).toBeLessThan(0.9);
  });

  it("rejects an invented text and a transcript that is too short", () => {
    expect(checkTranscript([{ speaker: "", text: "Ο Νίκος πήγε στη λαϊκή και αγόρασε ντομάτες, αγγούρια και πατάτες για όλη την εβδομάδα. Μετά ήπιε καφέ με έναν φίλο του στην πλατεία." }], page).ok).toBe(false);
    expect(checkTranscript([verbatim[0]], page).ok).toBe(false); // 20 words < MIN_WORDS
  });
});
