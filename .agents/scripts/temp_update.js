const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'apps', 'dashboard', 'src', 'pages', 'catalog-panel', 'views', 'CatalogProductForm.tsx');
let content = fs.readFileSync(filePath, 'utf8');

function removeFunction(code, funcName) {
  const regex = new RegExp(`(export )?function ${funcName}\\s*\\([\\s\\S]*?\\)\\s*\\{`);
  const match = code.match(regex);
  if (!match) return code;
  
  let braces = 1;
  let endIndex = match.index + match[0].length;
  while (braces > 0 && endIndex < code.length) {
    if (code[endIndex] === '{') braces++;
    if (code[endIndex] === '}') braces--;
    endIndex++;
  }
  
  const before = code.substring(0, match.index).trimEnd();
  const after = code.substring(endIndex).trimStart();
  return before + '\n\n' + after;
}

content = removeFunction(content, 'VariantEditorSheet');
content = removeFunction(content, 'PurchaseOptionModal');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated CatalogProductForm.tsx');
