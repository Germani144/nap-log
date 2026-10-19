# TEMPORARY: aggregate-only analysis, removed right after one run. Prints correlations/slopes/counts, never times or codes.
import json,os,urllib.request,urllib.parse,datetime as dt,numpy as np
from scipy import stats
KEY='AIzaSyDDKYM5tvjTixUdBq0BAd9-recAyoL6TE4';PID='nap-log-78cb6'
code=urllib.parse.quote(os.environ['FAMILY_CODE'],safe='')
base=f'https://firestore.googleapis.com/v1/projects/{PID}/databases/(default)/documents/families/{code}/entries'
E=[];tok=''
while True:
    u=base+'?pageSize=300&key='+KEY+('&pageToken='+tok if tok else '')
    j=json.load(urllib.request.urlopen(u))
    for d in j.get('documents',[]):
        f=d['fields'];g=lambda k:(lambda v:None if v is None or 'nullValue' in v else int(v.get('integerValue',v.get('doubleValue',0))))(f.get(k))
        E.append({'type':f['type']['stringValue'],'start':g('start'),'end':g('end')})
    tok=j.get('nextPageToken')
    if not tok:break
json.dump([dict(e,id=str(i)) for i,e in enumerate(E)],open('/tmp/h.json','w'))  # stays on the runner, never printed
loc=lambda ms:dt.datetime.fromtimestamp(ms/1000)
mins=lambda t:t.hour*60+t.minute+t.second/60
days={}
for e in E:
    if not e.get('end'):continue
    s,en=loc(e['start']),loc(e['end'])
    if e['type']=='nap':days.setdefault(s.date(),{}).setdefault('naps',[]).append((mins(s),mins(en)))
    else:
        days.setdefault(en.date(),{})['wake']=mins(en)
        b=mins(s); 
        if s.hour<5:b+=1440;d=(s-dt.timedelta(days=1)).date()
        else:d=s.date()
        days.setdefault(d,{})['bed']=b
rows=[]
for d in sorted(days):
    x=days[d]
    if 'wake' in x and 'bed' in x and x.get('naps'):
        nps=sorted(x['naps']);rows.append(dict(d=d,wake=x['wake'],bed=x['bed'],naps=nps,n=len(nps)))
print('complete days',len(rows),'span days',(rows[-1]['d']-rows[0]['d']).days,'since 15 Oct',sum(r['d']>=dt.date(2026,10,15) for r in rows),'nap counts',{k:sum(r['n']==k for r in rows) for k in (2,3,4,5)})
for r in rows:
    r['n1']=r['naps'][0][0];r['last_end']=r['naps'][-1][1];r['napsum']=sum(e-s for s,e in r['naps']);r['bedgap']=r['bed']-r['last_end']
# detrend: deviation from centered 7-day rolling median (handles the 4->3 nap switch and slow drift)
def dev(key,src=rows):
    v=np.array([r.get(key,np.nan) for r in src],float);o=np.full(len(v),np.nan)
    for i in range(len(v)):
        w=v[max(0,i-3):i+4];w=w[~np.isnan(w)]
        if len(w)>=3:o[i]=v[i]-np.median(w)
    return o
def rep(name,x,y):
    m=~np.isnan(x)&~np.isnan(y);x,y=x[m],y[m]
    r,p=stats.pearsonr(x,y);rs,ps=stats.spearmanr(x,y);sl=stats.linregress(x,y)
    print(f'{name:48s} n={len(x):2d} r={r:+.2f} (p={p:.3f}) rho={rs:+.2f} slope={sl.slope:+.2f}±{sl.stderr:.2f}')
print('\n== Bedtime: raw ==')
B=np.array([r['bed'] for r in rows],float)
print('bedtime sd %.0f min'%B.std())
for k in ['wake','n1','last_end','napsum','n']:rep('bed vs '+k,np.array([r[k] for r in rows],float),B)
print('bed gap after last nap: mean %.0f sd %.0f min'%(np.mean([r['bedgap'] for r in rows]),np.std([r['bedgap'] for r in rows])))
print('\n== Bedtime: day-to-day deviations (detrended) ==')
dB=dev('bed')
for k in ['wake','n1','last_end','napsum']:rep('dev bed vs dev '+k,dev(k),dB)
print('\n== Ripple (detrended deviations) ==')
for N in (3,4):
    S=[r for r in rows if r['n']==N]
    if len(S)<6:continue
    for r in S:
        for i,(s,e) in enumerate(r['naps']):r[f's{i+1}']=s;r[f'e{i+1}']=e
    print(f'-- days with {N} naps (n={len(S)}) --')
    dw=dev('wake',S);rep('nap1 start vs wake',dw,dev('s1',S))
    d1=dev('s1',S)
    for k in range(2,N+1):rep(f'nap{k} start vs nap1 start',d1,dev(f's{k}',S))
    for k in range(1,N+1):rep(f'nap{k} END vs nap1 start',d1,dev(f'e{k}',S))
    for k in range(2,N+1):rep(f'nap{k} start vs nap{k-1} end',dev(f'e{k-1}',S),dev(f's{k}',S))
    rep('bedtime vs nap1 start',d1,dev('bed',S));rep(f'bedtime vs nap{N} end',dev(f'e{N}',S),dev('bed',S))
    # awake window after a nap vs that nap's length
    for k in range(1,N):
        L=np.array([r[f'e{k}']-r[f's{k}'] for r in S]);W=np.array([r[f's{k+1}']-r[f'e{k}'] for r in S])
        rep(f'window after nap{k} vs nap{k} length (raw)',L.astype(float),W.astype(float))
    L=np.array([r[f'e{N}']-r[f's{N}'] for r in S],float);W=np.array([r['bed']-r[f'e{N}'] for r in S],float)
    rep(f'gap to bed vs nap{N} length (raw)',L,W)
