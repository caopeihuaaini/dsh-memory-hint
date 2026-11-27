window.__ModuleLoader__.load({
  id: '@local/dsh-memory-hint',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch {}

    const state = {
      items: [],
      error: '',
      setup: false,
      bound: null,
      label: '',
      picking: false,
      candidates: [],
      busy: false,
      customDir: '',
      rect: null,
    };
    const listeners = new Set();
    const emit = () => {
      for (const fn of listeners) {
        try {
          fn();
        } catch {}
      }
    };
    const setState = (patch) => {
      Object.assign(state, patch);
      emit();
    };
    const useStore = () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const fn = () => force((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
      }, []);
      return state;
    };

    const findComposer = () => {
      const nodes = document.querySelectorAll('[contenteditable="true"]');
      return nodes.length ? nodes[nodes.length - 1] : null;
    };

    const measure = () => {
      const el = findComposer();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r || !r.width) return;
      setState({ rect: { top: r.top, left: r.left, width: r.width } });
    };

    const readText = (el) => String((el && el.innerText) || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    const S = {
      box: { borderRadius: '9px', background: 'rgba(8,24,36,0.97)', border: '1px solid rgba(127,212,255,0.35)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' },
      chip: {
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#bfe6ff',
        background: 'rgba(16,44,64,0.95)',
        border: '1px solid rgba(127,212,255,0.5)',
      },
      muted: { color: 'rgba(200,224,240,0.7)', fontSize: '11px' },
      row: { display: 'flex', gap: '6px', alignItems: 'baseline' },
      opt: {
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '6px 8px',
        borderRadius: '7px',
        background: 'rgba(127,212,255,0.08)',
      },
    };

    function Panel() {
      const s = useStore();

      // 绑定引导：未绑定规则库时始终显示，提醒用户去选
      const showSetup = s.setup && !s.picking;
      if (!s.items.length && !s.error && !showSetup && !s.picking) return null;

      const r = s.rect;
      const wrap = {
        position: 'fixed',
        left: r ? Math.round(r.left) : 24,
        top: r ? Math.round(r.top) - 10 : 120,
        width: r ? Math.max(280, Math.round(r.width)) : 420,
        transform: 'translateY(-100%)',
        zIndex: 2147483000,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        font: '12px/1.5 system-ui, "Microsoft YaHei", sans-serif',
        color: '#e8f4ff',
      };

      const openPicker = async () => {
        setState({ picking: true, busy: true });
        try {
          const res = await fetch('/api/dsh-memory-hint/sources', { headers: { accept: 'application/json' } });
          const data = await res.json();
          setState({ candidates: Array.isArray(data.candidates) ? data.candidates : [], busy: false });
        } catch (e) {
          setState({ busy: false, error: String((e && e.message) || e) });
        }
      };

      const bind = async (id, dir) => {
        setState({ busy: true });
        try {
          const res = await fetch('/api/dsh-memory-hint/bind', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, dir }),
          });
          const data = await res.json();
          if (!res.ok) {
            setState({ busy: false, error: data.error || `HTTP ${res.status}` });
            return;
          }
          setState({ busy: false, picking: false, setup: false, bound: data.bound, label: data.label, error: '', items: [] });
          measure();
        } catch (e) {
          setState({ busy: false, error: String((e && e.message) || e) });
        }
      };

      let inner;
      if (s.picking) {
        inner = h(
          'div',
          { style: { ...S.box, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
          h('div', { style: { fontWeight: 600 } }, '选择记忆库'),
          s.busy && !s.candidates.length ? h('div', { style: S.muted }, '正在探测…') : null,
          ...s.candidates.map((c) =>
            h(
              'button',
              { key: c.id, type: 'button', style: S.opt, onClick: () => bind(c.id), disabled: s.busy },
              h('span', null, c.label),
              h('span', { style: S.muted }, `${c.count} 条`),
            ),
          ),
          !s.busy && !s.candidates.length ? h('div', { style: S.muted }, '没有检测到可用的规则文件') : null,
          h(
            'div',
            { style: { ...S.row, marginTop: '2px' } },
            h('input', {
              value: s.customDir,
              placeholder: '自定义目录，例如 D:\\rules',
              onChange: (e) => setState({ customDir: e.target.value }),
              style: {
                flex: 1,
                minWidth: 0,
                padding: '4px 7px',
                borderRadius: '6px',
                border: '1px solid rgba(127,212,255,0.35)',
                background: 'rgba(0,0,0,0.35)',
                color: '#e8f4ff',
                font: 'inherit',
              },
            }),
            h('button', { type: 'button', style: { ...S.chip, padding: '4px 9px' }, onClick: () => bind('custom', s.customDir) }, '绑定'),
            h('button', { type: 'button', style: { ...S.chip, background: 'transparent', border: '1px solid rgba(127,212,255,0.25)' }, onClick: () => setState({ picking: false }) }, '取消'),
          ),
          h('div', { style: S.muted }, '规则文件用 Markdown：每条以「## 标题」开头，或「§」分隔，或「- 条目」列表。'),
        );
      } else if (showSetup) {
        inner = h(
          'button',
          { type: 'button', style: S.chip, onClick: openPicker, title: '选择要读取的记忆库' },
          h('span', null, '⚑'),
          h('span', null, '未绑定记忆库'),
          h('span', { style: { opacity: 0.7, fontWeight: 400 } }, '选择'),
        );
      } else if (!s.items.length && s.error) {
        inner = h('div', { style: { ...S.box, padding: '5px 9px', color: '#ff9a9a', borderColor: 'rgba(255,138,138,0.5)', fontSize: '11px' }, title: s.error }, `⚑ 记忆提示不可用：${s.error}`);
      } else {
        inner = h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h(
            'button',
            { type: 'button', onClick: () => setState({ open: !s.open }), style: { ...S.chip, alignSelf: 'flex-start' } },
            h('span', null, '⚑'),
            h('span', null, `相关规则 ${s.items.length} 条`),
            h('span', { style: { opacity: 0.65, fontWeight: 400 } }, s.open ? '收起' : '展开'),
          ),
          s.open
            ? h(
                'div',
                { style: { ...S.box, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '240px', overflowY: 'auto' } },
                ...s.items.map((it, i) =>
                  h(
                    'div',
                    { key: `${i}-${it.title}` },
                    h('div', { style: S.row }, h('span', { style: { fontWeight: 600, color: '#f0f8ff' } }, it.title)),
                    it.body ? h('div', { style: S.muted }, it.body.slice(0, 180) + (it.body.length > 180 ? '…' : '')) : null,
                  ),
                ),
              )
            : null,
        );
      }

      const node = h('div', { style: wrap }, inner);
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') return ReactDOM.createPortal(node, document.body);
      return node;
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const clearHint = () => {
          if (state.items.length || state.error || state.open) setState({ items: [], error: '', open: false });
        };

        ctx.effect(() => {
          let timer = 0;
          let seq = 0;
          let lastQuery = '';
          let prevText = '';

          const runSearch = async (text) => {
            const q = text.slice(-300);
            measure();
            if (q.trim().length < 4) {
              clearHint();
              return;
            }
            if (q === lastQuery) return;
            lastQuery = q;
            const my = ++seq;
            try {
              const res = await fetch(`/api/dsh-memory-hint/search?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
              if (my !== seq) return;
              if (!res.ok) {
                setState({ items: [], error: `HTTP ${res.status}` });
                return;
              }
              const data = await res.json();
              if (my !== seq) return;
              setState({
                items: Array.isArray(data.items) ? data.items : [],
                setup: !!data.setup,
                bound: data.bound || null,
                label: data.label || '',
                error: '',
              });
            } catch (e) {
              if (my === seq) setState({ items: [], error: String((e && e.message) || e) });
            }
          };

          const handleText = (text) => {
            const shrunk = text.length < prevText.length;
            prevText = text;
            if (text.length < 4) {
              clearTimeout(timer);
              lastQuery = '';
              clearHint();
              return;
            }
            if (shrunk) {
              clearTimeout(timer);
              lastQuery = '';
              clearHint();
            }
            clearTimeout(timer);
            timer = setTimeout(() => runSearch(text), shrunk ? 180 : 300);
          };

          // 首屏探测：让"未绑定"提示在用户动手之前就出现
          (async () => {
            try {
              const res = await fetch('/api/dsh-memory-hint/sources', { headers: { accept: 'application/json' } });
              const data = await res.json();
              setState({ setup: !data.bound, bound: data.bound || null, candidates: data.candidates || [] });
            } catch {}
          })();

          const onInput = (event) => {
            const el = event.target;
            if (!el || !el.isContentEditable) return;
            handleText(readText(el));
          };
          const onFocusOut = (event) => {
            const el = event.target;
            if (!el || !el.isContentEditable) return;
            if (!readText(el)) handleText('');
          };
          const onViewportChange = () => measure();

          let lastSeen = '';
          const poll = setInterval(() => {
            const el = findComposer();
            if (!el) return;
            const text = readText(el);
            if (text === lastSeen) return;
            lastSeen = text;
            handleText(text);
          }, 250);

          document.addEventListener('input', onInput, true);
          document.addEventListener('focusout', onFocusOut, true);
          window.addEventListener('resize', onViewportChange);
          window.addEventListener('scroll', onViewportChange, true);
          return () => {
            clearTimeout(timer);
            clearInterval(poll);
            document.removeEventListener('input', onInput, true);
            document.removeEventListener('focusout', onFocusOut, true);
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('scroll', onViewportChange, true);
            listeners.clear();
          };
        });

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'memory-hint', order: 40 }, Panel),
        );
      },
    };
  },
});
