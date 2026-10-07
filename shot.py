import subprocess, sys, os

src = open("index.html", encoding="utf8").read()
probe = """<script>window.__errs=[];addEventListener('error',e=>{__errs.push(e.message)});addEventListener('unhandledrejection',e=>{__errs.push(String(e.reason))});</script>"""
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
cases = {
    "home": "",
    "open": "setTimeout(()=>{__fridge.snapOpen();},1200);",
    "shop": "setTimeout(()=>{document.getElementById('btnShop').click();},1500);",
    "board": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=board]').click(),300);},1500);",
    "protein": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=protein]').click(),300);},1500);",
    "town": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=town]').click(),300);},1500);",
    "detail": "setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>{document.querySelector('#shopTabs [data-tab=board]').click();setTimeout(()=>document.querySelector('#shopBody [data-food='+(location.hash.slice(1)||'cabbage')+']').click(),200);},300);},1500);",
    "add": "setTimeout(()=>{document.getElementById('btnAdd').click();setTimeout(()=>{const n=document.getElementById('addName');n.value='양배추';n.dispatchEvent(new Event('input'));document.getElementById('addPaid').value='3500';},300);},1500);",
    "ledger": "setTimeout(()=>{const add=(nm,p)=>{document.getElementById('btnAdd').click();const n=document.getElementById('addName');n.value=nm;n.dispatchEvent(new Event('input'));document.getElementById('addPaid').value=p;document.getElementById('addOk').click();};add('양배추','3500');setTimeout(()=>add('삼겹살',''),1000);setTimeout(()=>add('달걀 30구','6900'),2000);setTimeout(()=>{document.getElementById('btnShop').click();setTimeout(()=>document.querySelector('#shopTabs [data-tab=ledger]').click(),300);},3500);},1500);",
    "card": "setTimeout(()=>{__fridge.openCard('계란 30구');},1800);",
}
only = sys.argv[1:] or list(cases)
for name in only:
    js = cases[name]
    tail = f"<script>{js}setTimeout(()=>{{if(__errs.length){{document.body.insertAdjacentHTML('afterbegin','<pre style=\"position:fixed;z-index:99;background:red;color:#fff;top:0;left:0\">'+__errs.join('\\\\n')+'</pre>')}}}},8000);</script>"
    html = src.replace("<head>", "<head>" + probe, 1).replace("</body>", tail + "</body>", 1)
    fn = f"t_{name}.html"
    open(fn, "w", encoding="utf8").write(html)
    size = "1400,900"
    subprocess.run([chrome, "--headless=new", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--virtual-time-budget=12000", f"--window-size={size}", f"--screenshot={os.path.abspath('s_' + name + '.png')}", f"http://localhost:8765/{fn}#{os.environ.get('FOOD','')}"], capture_output=True, timeout=120)
    print(name, "done")
