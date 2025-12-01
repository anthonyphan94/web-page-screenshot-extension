// Mock chrome API globally before require
global.chrome = {
    runtime: {
        onMessage: {
            addListener: jest.fn()
        }
    }
};

const { findScrollableElement } = require('../content_script.js');

describe('findScrollableElement', () => {
    beforeEach(() => {
        // Mock chrome API
        global.chrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn()
                }
            }
        };

        // Reset DOM
        document.body.innerHTML = '';
        // Mock window properties
        Object.defineProperty(window, 'innerWidth', { value: 1024 });
        Object.defineProperty(window, 'innerHeight', { value: 768 });
        // Mock getComputedStyle
        window.getComputedStyle = (el) => el._style || { overflowY: 'visible', display: 'block', visibility: 'visible' };
    });

    // Require the script AFTER mocking chrome
    // Note: We need to clear module cache to re-evaluate the script if needed, 
    // but for now let's just require it once at the top level? 
    // No, if we require at top level, it runs before beforeEach.
    // We should move require inside the test or use jest.isolateModules.
    // But simplest is to mock global.chrome at top level.


    function createMockElement(tag, style = {}, props = {}) {
        const el = document.createElement(tag);
        el._style = {
            display: 'block',
            visibility: 'visible',
            overflowY: 'visible',
            opacity: '1',
            ...style
        };

        // Mock dimensions
        Object.defineProperty(el, 'scrollHeight', { value: props.scrollHeight || 100 });
        Object.defineProperty(el, 'clientHeight', { value: props.clientHeight || 100 });
        Object.defineProperty(el, 'clientWidth', { value: props.clientWidth || 1024 });

        // Mock getBoundingClientRect
        el.getBoundingClientRect = () => ({
            top: 0, bottom: 100, left: 0, right: 1024, width: 1024, height: 100,
            ...props.rect
        });

        return el;
    }

    test('should return document.documentElement if no other scrollable element exists', () => {
        const result = findScrollableElement();
        expect(result).toBe(document.documentElement);
    });

    test('should find a visible element with overflow: auto and content larger than view', () => {
        const div = createMockElement('div', { overflowY: 'auto' }, { scrollHeight: 2000, clientHeight: 500 });
        document.body.appendChild(div);

        const result = findScrollableElement();
        expect(result).toBe(div);
    });

    test('should ignore hidden elements even if they are scrollable', () => {
        const hiddenDiv = createMockElement('div',
            { overflowY: 'auto', display: 'none' },
            { scrollHeight: 2000, clientHeight: 500 }
        );
        document.body.appendChild(hiddenDiv);

        const result = findScrollableElement();
        expect(result).toBe(document.documentElement);
    });

    test('should ignore elements with visibility: hidden', () => {
        const hiddenDiv = createMockElement('div',
            { overflowY: 'auto', visibility: 'hidden' },
            { scrollHeight: 2000, clientHeight: 500 }
        );
        document.body.appendChild(hiddenDiv);

        const result = findScrollableElement();
        expect(result).toBe(document.documentElement);
    });

    test('should prioritize the element with the largest scrollHeight', () => {
        const smallScroll = createMockElement('div', { overflowY: 'auto' }, { scrollHeight: 1000, clientHeight: 500 });
        const bigScroll = createMockElement('div', { overflowY: 'auto' }, { scrollHeight: 5000, clientHeight: 500 });

        document.body.appendChild(smallScroll);
        document.body.appendChild(bigScroll);

        const result = findScrollableElement();
        expect(result).toBe(bigScroll);
    });

    test('should ignore elements outside the viewport', () => {
        const offScreenDiv = createMockElement('div',
            { overflowY: 'auto' },
            {
                scrollHeight: 2000,
                clientHeight: 500,
                rect: { top: 2000, bottom: 2500 } // Way below viewport
            }
        );
        document.body.appendChild(offScreenDiv);

        const result = findScrollableElement();
        expect(result).toBe(document.documentElement);
    });
});
