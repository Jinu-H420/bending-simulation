// かんたん判定（check.html）の入口。画面の中身は check.jsx（C形ページ c.html と共用）
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CheckApp, Boundary } from './check.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<Boundary><CheckApp /></Boundary>);
