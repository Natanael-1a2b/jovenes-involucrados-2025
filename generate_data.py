import json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import pdfplumber

full = ''
with pdfplumber.open('Preguntas de Jóvenes Involucrados-2025.pdf') as pdf:
    for p in pdf.pages:
        t = p.extract_text()
        if t: full += t + '\n'

disc_start = full.find('PREGUNTAS DE DISCIPULADO')
hs_start = full.find('Preguntas de la Hora silenciosa')
vers_start = full.find('Versículos para memorizar.')

lecciones_text = full[:disc_start]
disc_text = full[disc_start:hs_start]
hs_text = full[hs_start:vers_start]
vers_text = full[vers_start:]

# ── LECCIONES ──
def parse_lecciones(text):
    items = []
    lines = text.split('\n')
    current_carpeta = ''
    current_leccion = ''
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('Carpeta:'):
            current_carpeta = line.replace('Carpeta:', '').strip()
            i += 1; continue
        if line.startswith('Lección:'):
            current_leccion = line.replace('Lección:', '').strip()
            i += 1; continue
        m = re.match(r'^(\d+)[\-\)\.]\s*(.*)', line)
        if m:
            num = m.group(1)
            q_text = m.group(2).strip()
            # Collect multi-line question (lines before answer marker)
            answer_lines = []
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if l.startswith('Carpeta:') or l.startswith('Lección:'):
                    break
                if re.match(r'^\d+[\-\)\.]\s', l):
                    break
                # Check if it's a bullet/answer line (starts with space or bullet)
                answer_lines.append(l)
                i += 1
            answer = ' '.join(answer_lines).strip()
            # Clean leading bullets
            answer = re.sub(r'^[•\uf0b7]\s*', '', answer)
            if q_text and answer:
                if not q_text.endswith('?') and not q_text.endswith(':'):
                    q_text += '?'
                # Remove stray ? from middle
                q_text = re.sub(r'\?\?+', '?', q_text)
                items.append({
                    "num": int(num),
                    "q": q_text,
                    "a": answer.lstrip(' '),
                    "carpeta": current_carpeta,
                    "leccion": current_leccion
                })
        else:
            i += 1
    return items

# ── DISCIPULADO ──
def parse_discipulado(text):
    items = []
    # Split by "Pregunta N" markers
    blocks = re.split(r'(?=Pregunta\s+\d+)', text)
    for block in blocks:
        m = re.match(r'Pregunta\s+(\d+)\.?\s*(.*?)(?:\n|$)', block.strip())
        if not m: continue
        num = m.group(1)
        q = m.group(2).strip()

        # Get full source line: "Fuente: Discipulado. Lección N. TITLE"
        leccion_num = ''
        leccion_titulo = ''
        src_m = re.search(r'Fuente:\s*Discipulado\.?\s*Lección\s*(\d+)\.?\s*(.+?)(?:\n|$)', block)
        if src_m:
            leccion_num = src_m.group(1).strip()
            leccion_titulo = src_m.group(2).strip()

        # Get answer
        a_m = re.search(r'R/\.?\s*(.*?)(?=(?:Fuente:|Pregunta\s+\d+|$))', block, re.DOTALL)
        answer = ''
        if a_m:
            answer = ' '.join(a_m.group(1).strip().split())
        else:
            # Fallback: Capture everything between question line and Fuente line
            lines = block.strip().split('\n')
            ans_lines = []
            for i in range(1, len(lines)):
                if lines[i].startswith('Fuente:'): break
                ans_lines.append(lines[i].strip())
            answer = ' '.join(ans_lines).strip()
            
            if not answer:
                answer = "(Respuesta no provista en el documento)"

        if q and len(q) > 3:
            if not q.endswith('?') and not q.endswith(':') and not q.endswith('.'):
                q += '?'
            items.append({
                "num": int(num),
                "q": q,
                "a": answer,
                "leccion_num": leccion_num,
                "leccion_titulo": leccion_titulo
            })
    return items

# ── HORA SILENCIOSA ──
def parse_hora_silenciosa(text):
    items = []
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = re.match(r'^(\d+)[\-\)\.]\s*(.*)', line)
        if m:
            num = m.group(1)
            q_text = m.group(2).strip()
            answer_lines = []
            i += 1
            # Collect answer after R/
            found_answer = False
            while i < len(lines):
                l = lines[i].strip()
                if re.match(r'^\d+[\-\)\.]\s', l): break
                if l.startswith('R/'):
                    found_answer = True
                    rest = re.sub(r'^R/\.?\s*', '', l)
                    if rest: answer_lines.append(rest)
                    i += 1; continue
                if found_answer:
                    if l: answer_lines.append(l)
                i += 1
            answer = ' '.join(answer_lines).strip()
            if q_text and answer:
                if not q_text.endswith('?') and not q_text.endswith(':'):
                    q_text += '?'
                items.append({
                    "num": int(num),
                    "q": q_text,
                    "a": answer
                })
        else:
            i += 1
    return items

# ── VERSÍCULOS ──
def parse_versiculos(text):
    items = []
    lines = text.split('\n')
    current_leccion = ''
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('Lección:'):
            current_leccion = line.replace('Lección:', '').strip()
            i += 1; continue
        vm = re.match(r'^(\d+)\.\s*(.*)', line)
        if vm:
            num = vm.group(1)
            rest = vm.group(2).strip()
            # Collect multi-line verse
            i += 1
            while i < len(lines):
                l = lines[i].strip()
                if l.startswith('Lección:') or re.match(r'^\d+\.\s', l): break
                if l: rest += ' ' + l
                i += 1
            # Split reference from text
            ref_m = re.match(r'((?:\d+\s*)?[A-ZÁ-Ú][a-záéíóúñ]+\s+\d+[:\d\-]*)\s+(.*)', rest)
            if ref_m:
                ref = ref_m.group(1).strip()
                txt = ref_m.group(2).strip()
                items.append({
                    "num": int(num),
                    "q": f"¿Qué dice {ref}?",
                    "a": txt,
                    "referencia": ref,
                    "leccion": current_leccion
                })
        else:
            i += 1
    return items

lecciones = parse_lecciones(lecciones_text)
discipulado = parse_discipulado(disc_text)
hora_silenciosa = parse_hora_silenciosa(hs_text)
versiculos = parse_versiculos(vers_text)

print(f"Lecciones: {len(lecciones)}")
print(f"Discipulado: {len(discipulado)}")
print(f"Hora Silenciosa: {len(hora_silenciosa)}")
print(f"Versiculos: {len(versiculos)}")

data = {
    "lecciones": lecciones,
    "discipulado": discipulado,
    "hora_silenciosa": hora_silenciosa,
    "versiculos": versiculos
}

js = "const QUESTIONS = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
with open('questions.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Generated questions.js successfully!")
# Print samples
for cat in data:
    print(f"\n--- {cat} sample ---")
    if data[cat]:
        print(json.dumps(data[cat][0], ensure_ascii=False, indent=2))
