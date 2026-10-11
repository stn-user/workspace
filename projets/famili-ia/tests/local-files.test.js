const { listLocalFiles, readFileContent } = require("../local-files.js");
const { Filesystem } = require("@capacitor/filesystem");

// Mocking Capacitor Filesystem for native platform
jest.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn()
  }
}));

describe("local-files module", () => {
  test("listLocalFiles returns supported files", async () => {
    Filesystem.readdir.mockResolvedValue({ files: [{ name: "doc.pdf" }, { name: ".hidden" }, { name: "image.png" }] });
    const files = await listLocalFiles("Documents");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("doc.pdf");
  });

  test("readFileContent reads PDF and returns string", async () => {
    const sampleBlob = new Blob([
      // minimal PDF bytes
      "<\?xml version=\"1.0\"?\>\n",
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n2 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    ], { type: "application/pdf" });
    const content = await readFileContent(sampleBlob, "doc.pdf");
    expect(content).toContain("%%EOF");
  });
});