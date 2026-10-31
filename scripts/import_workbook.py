"""Convert the supplied workbook into the site's baseline; requires openpyxl."""
import json, re
from pathlib import Path
from datetime import datetime
import openpyxl
root = Path(__file__).resolve().parents[1]
w = openpyxl.load_workbook(root/'data/N14_Riviera_Original.xlsx', data_only=True)
def values(sheet, row, count):
    return [w[sheet].cell(row,c).value for c in range(1,count+1)]
def date(v):
    return v.strftime('%Y-%m-%d') if isinstance(v,datetime) else v
phases=[]; services=[]
for row in w['Orçamento']:
    a=[c.value for c in row[:12]]
    if isinstance(a[0],str) and re.match(r'^\d{2} - ',a[0]):
        phase=a[0]; phases.append(phase)
    elif isinstance(a[0],str) and re.fullmatch(r'\d{2}\.\d{2}',a[0]):
        services.append(dict(zip(['id','name','unit','quantity','material','labor','thirdParty','total','weight','perArea','confidence','note'],a),phase=phase))
resources=[]
for r in range(4,387):
    a=values('Quantitativos',r,15)
    if a[0]:resources.append(dict(zip(['serviceId','phase','service','name','nature','quantity','unit','price','material','labor','thirdParty','total','criterion','source','note'],a),id=f'q{r}'))
tasks=[]
for row in w['Planejamento']:
    a=[date(c.value) for c in row[:12]]
    if isinstance(a[0],str) and re.fullmatch(r'\d{2}\.\d{2}',a[0]):
        tasks.append(dict(zip(['id','name','unit','quantity','cost','weight','duration','start','end','predecessor','progress','status'],a)))
notes=[]
for row in w['Premissas e Fontes']:
    a=[c.value for c in row[:4]]
    if a[0] and a[1] and a[0]!='Tema':notes.append(dict(zip(['topic','text','impact','source'],a)))
data=dict(version=1,project='N14 Riviera',area=w['Orçamento']['B2'].value,reserve=w['Orçamento']['E2'].value,phases=phases,services=services,resources=resources,tasks=tasks,notes=notes,baseline={'direct':w['Orçamento']['H227'].value,'total':w['Orçamento']['H229'].value},source='N14_Riviera_Orcamento_Gantt_Revisado.xlsx')
(root/'data/project.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f'{len(services)} serviços, {len(resources)} insumos, {len(tasks)} atividades, {len(phases)} fases')
print('Direct recalculated:',sum(x['quantity']*x['price'] for x in resources),'baseline:',data['baseline'])
