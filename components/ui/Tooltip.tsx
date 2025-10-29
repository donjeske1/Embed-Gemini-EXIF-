import React from 'react';

interface TooltipProps {
  children: React.ReactElement;
  tip: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ children, tip, position = 'top', className }) => {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };
  
  const originClasses = {
      top: 'origin-bottom',
      bottom: 'origin-top',
      left: 'origin-right',
      right: 'origin-left',
  }

  const arrowClasses = {
      top: 'left-1/2 -translate-x-1/2 bottom-[-4px] border-l-transparent border-r-transparent border-t-slate-800 dark:border-t-slate-700',
      bottom: 'left-1/2 -translate-x-1/2 top-[-4px] border-l-transparent border-r-transparent border-b-slate-800 dark:border-b-slate-700',
      left: 'top-1/2 -translate-y-1/2 right-[-4px] border-t-transparent border-b-transparent border-l-slate-800 dark:border-l-slate-700',
      right: 'top-1/2 -translate-y-1/2 left-[-4px] border-t-transparent border-b-transparent border-r-slate-800 dark:border-r-slate-700',
  }

  return (
    <div className={`relative group ${className || ''}`}>
      {children}
      <div
        role="tooltip"
        className={`absolute ${positionClasses[position]} ${originClasses[position]} w-max max-w-xs scale-0 group-hover:scale-100 transition-all duration-200 z-50 p-2 text-xs font-medium text-white bg-slate-800 dark:bg-slate-700 rounded-md shadow-lg`}
      >
        {tip}
        <div className={`absolute border-[4px] ${arrowClasses[position]}`} />
      </div>
    </div>
  );
};

export default Tooltip;
