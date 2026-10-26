// App de ejemplo del provider demo (misma que el backend local).
export const DEMO_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mis tareas</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#F4F4F5] text-[#0B0B0C] p-6">
<main class="mx-auto max-w-xl">
<h1 class="mb-4 flex items-center gap-2 text-3xl font-bold"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-7 w-7"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5h10m-10 7h10m-10 7h10"/><rect width="4" height="4" x="3" y="3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/><rect width="4" height="4" x="3" y="10" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/><rect width="4" height="4" x="3" y="17" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="1"/></svg>Mis tareas</h1>
<form id="f" class="mb-4 flex gap-2"><input id="t" placeholder="Nueva tarea..." class="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-base"><button class="flex items-center gap-1 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-base text-white hover:bg-[#E85D00]"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h7m7 0h-7m0 0V5m0 7v7"/></svg>Agregar</button></form>
<ul id="list" class="space-y-2"></ul>
</main>
<script>
  var ICON_DONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 5v0a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0M8 5v0a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v0"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 14 2 2 4-5"/></svg>';
  var ICON_DEL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="h-5 w-5"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7v0a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v0M9 7h6M9 7H6m9 0h3m2 0h-2M4 7h2m0 0v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/></svg>';
  var list = document.getElementById('list');
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('t');
    var v = input.value.trim();
    if (!v) return;
    var li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3';
    var span = document.createElement('span');
    span.textContent = v;
    var actions = document.createElement('span');
    actions.className = 'flex shrink-0 gap-1';
    var doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'text-zinc-500';
    doneBtn.innerHTML = ICON_DONE;
    doneBtn.addEventListener('click', function () {
      span.classList.toggle('line-through');
      span.classList.toggle('text-zinc-400');
    });
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'text-zinc-500';
    delBtn.innerHTML = ICON_DEL;
    delBtn.addEventListener('click', function () { li.remove(); });
    actions.appendChild(doneBtn);
    actions.appendChild(delBtn);
    li.appendChild(span);
    li.appendChild(actions);
    list.appendChild(li);
    input.value = '';
  });
</script>
</body>
</html>`;
