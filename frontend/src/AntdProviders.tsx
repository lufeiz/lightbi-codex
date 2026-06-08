import { App as AntApp, ConfigProvider, unstableSetRender } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

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

export function AntdProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { borderRadius: 8, colorPrimary: '#1769e0' } }}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
