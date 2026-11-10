"""DSA claim generator built around the supplied a2i DOCX template."""
from flask import Flask, render_template, request, send_file, jsonify
from docx import Document
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime
from io import BytesIO
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
import re

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
TEMPLATE = Path(__file__).parent / 'assets' / 'original_template.docx'


def money(value, label='amount'):
    try:
        v = Decimal(str(value))
        if not v.is_finite() or v < 0:
            raise ValueError
        return v
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f'{label} must be a non-negative number')


def fmt(value):
    v = value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return format(v, 'f').rstrip('0').rstrip('.') if '.' in format(v, 'f') else format(v, 'f')


def words_under_thousand(n):
    small = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
    tens = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
    parts = []
    if n >= 100:
        parts.append(small[n//100] + ' hundred'); n %= 100
    if n >= 20:
        parts.append(tens[n//10] + ('-' + small[n%10] if n%10 else ''))
    elif n:
        parts.append(small[n])
    return ' '.join(parts)


def amount_words(v):
    v = v.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    taka = int(v)
    paisa = int((v - Decimal(taka)) * 100)
    if taka > 999_999_999_999:
        raise ValueError('Claim total is too large')
    if taka == 0:
        part = 'zero'
    else:
        groups = [(1_000_000_000,'billion'),(1_000_000,'million'),(1_000,'thousand'),(1,'')]
        parts = []
        for div,name in groups:
            n = taka // div
            taka %= div
            if n:
                parts.append(words_under_thousand(n) + (' ' + name if name else ''))
        part = ' '.join(parts)
    result = part + ' taka'
    if paisa:
        result += ' and ' + words_under_thousand(paisa) + ' paisa'
    return result.capitalize() + '.'


def date_f(value):
    try:
        return datetime.strptime(value, '%Y-%m-%d').strftime('%d/%m/%Y')
    except (TypeError, ValueError):
        raise ValueError('Dates must use YYYY-MM-DD format')


def required(value, label):
    value = str(value or '').strip()
    if not value:
        raise ValueError(f'{label} is required')
    return value


def put(cell, value, paragraph=0):
    """Replace text but keep existing cell dimensions and paragraph styling."""
    p = cell.paragraphs[paragraph]
    if p.runs:
        p.runs[0].text = str(value)
        for run in p.runs[1:]:
            run.text = ''
    else:
        p.add_run(str(value))


def set_cell(row, column, value):
    put(row.cells[column], value)


def add_after(table, row_index, count):
    """Duplicate an existing document row before the next section."""
    original = table.rows[row_index]._tr
    for _ in range(count):
        original.addnext(deepcopy(original))


def fill_para(p, text):
    if p.runs:
        p.runs[0].text = text
        for r in p.runs[1:]: r.text = ''
    else:
        p.add_run(text)


def clear_highlights(doc):
    # Remove highlights from all document XML, including bullet markers.
    for part in [doc.part, doc.part.numbering_part]:
        for element in part.element.xpath(".//w:highlight"):
            element.getparent().remove(element)
    for p in doc.paragraphs:
        for r in p.runs: r.font.highlight_color = None
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    for r in p.runs: r.font.highlight_color = None


def validate(payload):
    itinerary = payload.get('itinerary') or []
    legs = payload.get('legs') or []
    travelers = payload.get('travelers') or []
    if not 1 <= len(travelers) <= 100: raise ValueError('Provide between 1 and 100 travelers')
    if not 1 <= len(itinerary) <= 15: raise ValueError('Provide between 1 and 15 itinerary activities')
    if not 1 <= len(legs) <= 15: raise ValueError('Provide between 1 and 15 travel legs')
    required(payload.get('purpose'), 'Purpose of visit')
    required(payload.get('organization'), 'Organization')
    required(payload.get('arranger'), 'Travel arranger')
    for i, item in enumerate(itinerary,1):
        date_f(item.get('date'))
        money(item.get('duration'), f'Itinerary {i} duration')
        required(item.get('location'), f'Itinerary {i} location')
        required(item.get('activity'), f'Itinerary {i} purpose')
    for i, leg in enumerate(legs,1):
        date_f(leg.get('departure_date')); date_f(leg.get('arrival_date'))
        required(leg.get('route'), f'Leg {i} route')
        required(leg.get('mode'), f'Leg {i} mode')
        required(leg.get('departure_time'), f'Leg {i} departure time')
        required(leg.get('arrival_time'), f'Leg {i} arrival time')
        money(leg.get('km'), f'Leg {i} distance')
        money(leg.get('rate'), f'Leg {i} per-km rate')
    for i, traveler in enumerate(travelers,1):
        required(traveler.get('name'), f'Traveler {i} name')
        required(traveler.get('designation'), f'Traveler {i} designation')
        required(traveler.get('team'), f'Traveler {i} team')
        money(traveler.get('full_days',0),f'Traveler {i} full days')
        money(traveler.get('half_days',0),f'Traveler {i} half days')
        money(traveler.get('dsa_rate'),f'Traveler {i} DSA rate')
        if traveler.get('ta_multiplier') not in (None,''):
            money(traveler['ta_multiplier'],f'Traveler {i} TA multiplier')


def calculate(payload, traveler):
    rate = money(traveler['dsa_rate'])
    full = money(traveler.get('full_days',0))
    half = money(traveler.get('half_days',0))
    multiplier = money(traveler.get('ta_multiplier',1) if traveler.get('ta_multiplier') not in (None,'') else 1)
    dsa = (full + half * Decimal('0.5')) * rate
    ta_rows = []
    for leg in payload['legs']:
        amount = money(leg['km']) * money(leg['rate']) * multiplier
        ta_rows.append(amount)
    ta = sum(ta_rows, Decimal('0'))
    return {'dsa':dsa,'ta':ta,'total':dsa+ta,'ta_rows':ta_rows,'full':full,'half':half,'rate':rate}


def build_document(payload, traveler):
    calc = calculate(payload, traveler)
    doc = Document(TEMPLATE)
    a,b,c,signatures = doc.tables
    for idx,label,value in [(0,'Name of Official',traveler['name']), (1,'Designation',traveler['designation']), (2,'Team/Office',traveler['team'])]:
        put(a.rows[idx].cells[0],f'{label}: {value}')
    pcell = a.rows[3].cells[0]
    purposes = [x.strip() for x in payload['purpose'].split('\n') if x.strip()]
    while len(pcell.paragraphs) < len(purposes)+1:
        clone = deepcopy(pcell.paragraphs[-1]._p)
        pcell._tc.append(clone)
    for i,p in enumerate(pcell.paragraphs[1:]):
        fill_para(p, purposes[i] if i < len(purposes) else '')
    set_cell(a.rows[4],1,fmt(calc['full']+calc['half']))
    set_cell(a.rows[5],1,payload.get('mode','By Road'))
    set_cell(a.rows[6],1,fmt(calc['dsa']))
    set_cell(a.rows[7],1,fmt(calc['ta'])+'/-')
    set_cell(a.rows[8],1,fmt(calc['total'])+'/-')
    put(a.rows[9].cells[0], 'Travel arranger (Please specify): ' + payload['arranger'])

    # The itinerary begins at row 2. Insert rows before section B for longer trips.
    if len(payload['itinerary']) > 2:
        add_after(b, 3, len(payload['itinerary'])-2)
    for i,item in enumerate(payload['itinerary']):
        row = b.rows[2+i]
        for col,val in [(0,date_f(item['date'])),(2,fmt(money(item['duration']))),(4,item['location']),(7,item['activity'])]:
            set_cell(row,col,val)
    # Blank unused original activity rows, but leave B's section intact.
    for i in range(len(payload['itinerary']),2):
        for col in (0,2,4,7): set_cell(b.rows[2+i],col,'')
    leg_start = 7 + max(0,len(payload['itinerary'])-2)
    if len(payload['legs']) > 4:
        add_after(b,leg_start+3,len(payload['legs'])-4)
    for i,leg in enumerate(payload['legs']):
        row=b.rows[leg_start+i]
        for col,val in [(0,leg['route']),(1,leg['mode']),(3,date_f(leg['departure_date'])),(5,leg['departure_time']),(6,date_f(leg['arrival_date'])),(8,leg['arrival_time'])]:
            set_cell(row,col,val)
    for i in range(len(payload['legs']),4):
        for col in (0,1,3,5,6,8): set_cell(b.rows[leg_start+i],col,'')

    # C: write one full-day and one half-day row as applicable.
    dsa_rows=[]
    if calc['full']: dsa_rows.append((calc['full'],'Full',calc['full']*calc['rate']))
    if calc['half']: dsa_rows.append((calc['half'],'Half',calc['half']*calc['rate']*Decimal('0.5')))
    if not dsa_rows: dsa_rows=[(Decimal('0'),'Full',Decimal('0'))]
    for i,(days,kind,amount) in enumerate(dsa_rows):
        row=c.rows[2+i]
        for col,val in [(0,fmt(days)),(1,fmt(calc['rate'])),(3,kind),(6,fmt(amount)),(10,'')]:set_cell(row,col,val)
    for i in range(len(dsa_rows),4):
        for col in (0,1,3,6,10):set_cell(c.rows[2+i],col,'')
    set_cell(c.rows[6],6,fmt(calc['dsa'])+'/-')
    if len(payload['legs'])>7:
        add_after(c,15,len(payload['legs'])-7)
    for i,leg in enumerate(payload['legs']):
        row=c.rows[9+i]
        for col,val in [(0,date_f(leg['departure_date'])),(2,fmt(money(leg['km']))),(4,leg['mode']),(5,fmt(money(leg['rate'])*money(traveler.get('ta_multiplier',1) if traveler.get('ta_multiplier') not in (None,'') else 1))),(7,fmt(calc['ta_rows'][i])),(9,leg['route'])]: set_cell(row,col,val)
    for i in range(len(payload['legs']),7):
        for col in (0,2,4,5,7,9): set_cell(c.rows[9+i],col,'')
    totals_base=max(0,len(payload['legs'])-7)
    set_cell(c.rows[16+totals_base],8,fmt(calc['ta'])+'/-')
    set_cell(c.rows[17+totals_base],8,fmt(calc['total'])+'/-')
    fill_para(doc.paragraphs[6], 'Total Amount in Word: '+amount_words(calc['total']))
    sig=signatures.rows[0].cells[0]
    if len(sig.paragraphs)>1: fill_para(sig.paragraphs[1],traveler['name'])
    if len(sig.paragraphs)>2: fill_para(sig.paragraphs[2],traveler['designation']+', '+traveler['team'])
    if len(sig.paragraphs)>3: fill_para(sig.paragraphs[3],payload['organization'])
    clear_highlights(doc)
    out=BytesIO();doc.save(out);out.seek(0)
    return out.getvalue(),calc


@app.get('/')
def home(): return render_template('index.html')


@app.post('/api/generate')
def generate():
    try:
        payload=request.get_json(force=True)
        if not isinstance(payload,dict): raise ValueError('Expected a JSON object')
        validate(payload)
        destination=BytesIO()
        used=set()
        with ZipFile(destination,'w',ZIP_DEFLATED) as z:
            summary=['Traveler,Designation,Team,Full Days,Half Days,DSA Rate,DSA,Travel Allowance,Total Claim']
            for i, traveler in enumerate(payload['travelers'],1):
                document,calc=build_document(payload,traveler)
                basename=re.sub(r'[^A-Za-z0-9_-]+', '_', traveler['name']).strip('_') or f'traveler_{i}'
                filename=f'{i:02d}_{basename}_DSA.docx'
                while filename in used:filename=f'{i:02d}_{basename}_{len(used)}_DSA.docx'
                used.add(filename)
                z.writestr(filename,document)
                csv_cells=[traveler['name'],traveler['designation'],traveler['team'],fmt(calc['full']),fmt(calc['half']),fmt(calc['rate']),fmt(calc['dsa']),fmt(calc['ta']),fmt(calc['total'])]
                summary.append(','.join('"'+str(cell).replace('"','""')+'"' for cell in csv_cells))
            z.writestr('claim_summary.csv','\ufeff'+'\n'.join(summary))
        destination.seek(0)
        return send_file(destination,mimetype='application/zip',as_attachment=True,download_name='DSA_Claims.zip')
    except (ValueError,KeyError,TypeError,IndexError) as ex:
        return jsonify({'error':str(ex)}),400


if __name__=='__main__':
    app.run(debug=False,host='127.0.0.1',port=5000)
