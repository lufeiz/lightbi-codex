import { App as AntApp, ConfigProvider, unstableSetRender } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '@/App';
import '@/styles/global.css';
import { initPerformanceMonitoring } from '@/features/charts/chartUtils';

const antdStaticRoots = new WeakMap<Element | DocumentFragment, Root>();

unstableSetRender((node, container) => {
  let root = antdStaticRoots.get(container);
  if (!root) {
    root = createRoot(container);
    antdStaticRoots.set(container, root);
  }
  root.render(node);
  return async () => {
    root?.unmount();
    antdStaticRoots.delete(container);
  };
});

initPerformanceMonitoring();

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { borderRadius: 8, colorPrimary: '#1769e0' } }}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
