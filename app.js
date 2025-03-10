// Global variables
let data = null;
let currentFrameIndex = 0;
let isPlaying = false;
let playInterval = null;

// Activity color mapping
const activityColors = {
    'CP': '#FF6B6B',  // Concrete Pouring
    'IV': '#4ECDC4',  // Inspection & Verification
    'WAT': '#45B7D1', // Walking & Transportation
    'TRL': '#96CEB4', // Tool Retrieval
    'CMI': '#FFBE0B', // Construction Material Installation
    'CSD': '#FF9F1C', // Construction Site Documentation
    'SCD': '#D4A373'  // Site Condition Documentation
};

// Activity descriptions
const activityDescriptions = {
    'CP': 'Concrete Pouring',
    'IV': 'Inspection & Verification',
    'WAT': 'Walking & Transportation',
    'TRL': 'Tool Retrieval',
    'CMI': 'Construction Material Installation',
    'CSD': 'Construction Site Documentation',
    'SCD': 'Site Condition Documentation'
};

// Load data
async function loadData() {
    try {
        const response = await fetch('annotations.json');
        if (!response.ok) {
            console.error('HTTP Error:', response.status, response.statusText);
            throw new Error(`HTTP Error! Status: ${response.status}, Message: ${response.statusText}`);
        }
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Received Data:', text);
            throw new Error('JSON parsing failed, please check data format');
        }
        if (!data || !data.frames || !data.frames.length) {
            console.error('Invalid Data Format:', data);
            throw new Error('Invalid data format, missing required frames field');
        }
        console.log('Data loaded successfully');
        initializeVisualization();
        startPlayback();
    } catch (error) {
        console.error('Data Loading Error:', error);
        alert(`Data Loading Failed: ${error.message}\nPlease check console for details`);
    }
}

// Initialize visualization
function initializeVisualization() {
    setupPositionView();
    setupTimelineView();
    setupControls();
    setupLegend();
    updateVisualization(currentFrameIndex);
}

// Setup position view
function setupPositionView() {
    const canvas = document.getElementById('position-canvas');
    const container = document.getElementById('position-view');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    canvas.addEventListener('mousemove', handlePositionHover);
}

// Handle position view hover effect
function handlePositionHover(event) {
    const canvas = document.getElementById('position-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if hovering over worker position
    const frame = data.frames[currentFrameIndex];
    let hoveredWorker = null;

    Object.entries(frame.workers).forEach(([workerId, worker]) => {
        const dx = x - scaleX(worker.position.x);
        const dy = y - scaleY(worker.position.y);
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
            hoveredWorker = workerId;
        }
    });

    // Redraw position view
    drawPositionView(hoveredWorker);
}

// Scale coordinates
function scaleX(x) {
    const canvas = document.getElementById('position-canvas');
    return (x / 2200) * canvas.width;
}

function scaleY(y) {
    const canvas = document.getElementById('position-canvas');
    return canvas.height - (y / 1000) * canvas.height;
}

// Draw position view
function drawPositionView(hoveredWorker = null) {
    const canvas = document.getElementById('position-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all worker trajectories
    Object.keys(data.frames[0].workers).forEach(workerId => {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(200, 200, 200, 0.3)`;
        ctx.lineWidth = 1;

        data.frames.forEach((frame, index) => {
            const worker = frame.workers[workerId];
            const x = scaleX(worker.position.x);
            const y = scaleY(worker.position.y);
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    });

    // Draw current frame worker positions
    const frame = data.frames[currentFrameIndex];
    Object.entries(frame.workers).forEach(([workerId, worker]) => {
        const x = scaleX(worker.position.x);
        const y = scaleY(worker.position.y);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = workerId === hoveredWorker ? 
            activityColors[worker.activity] : 
            `rgba(${hexToRgb(activityColors[worker.activity])}, 0.6)`;
        ctx.fill();

        if (workerId === hoveredWorker) {
            ctx.font = '12px Times New Roman';
            ctx.fillStyle = '#333';
            ctx.fillText(`${workerId}: ${activityDescriptions[worker.activity]}`, x + 10, y - 10);
        }
    });
}

// Setup legend
function setupLegend() {
    const legend = document.querySelector('.legend');
    legend.innerHTML = '';
    
    Object.entries(activityDescriptions).forEach(([code, description]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        
        const color = document.createElement('div');
        color.className = 'legend-color';
        color.style.backgroundColor = activityColors[code];
        
        const text = document.createElement('span');
        text.textContent = description;
        
        item.appendChild(color);
        item.appendChild(text);
        legend.appendChild(item);
    });
}

// Setup timeline view
function setupTimelineView() {
    const container = document.getElementById('timeline-view');
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    // 设置容器样式
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.position = 'relative';
    container.style.width = '100%';

    // Clear existing SVG
    d3.select('#timeline-view svg').remove();

    const svg = d3.select('#timeline-view')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleLinear()
        .domain([0, data.frames.length - 1])
        .range([0, width]);

    const yScale = d3.scaleBand()
        .domain(Object.keys(data.frames[0].workers).sort())
        .range([0, height])
        .padding(0.1);

    // Add zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([1, 10])
        .on('zoom', (event) => {
            const newXScale = event.transform.rescaleX(xScale);
            svg.selectAll('rect').each(function() {
                const rect = d3.select(this);
                const workerId = rect.attr('class');
                const frameIndex = rect.datum().frameIndex;
                rect.attr('x', newXScale(frameIndex))
                    .attr('width', Math.max(1, (width / data.frames.length) * event.transform.k));
            });
            updateTimelinePaths(svg, newXScale, yScale);
            updateTimelineAxis(svg, newXScale, height);
        });

    svg.call(zoom);

    // Draw timeline
    Object.keys(data.frames[0].workers).forEach(workerId => {
        const activities = data.frames.map((frame, i) => ({
            frameIndex: i,
            activity: frame.workers[workerId].activity,
            posture: frame.workers[workerId].posture
        }));

        svg.selectAll(`rect.${workerId}`)
            .data(activities)
            .enter()
            .append('rect')
            .attr('class', workerId)
            .attr('x', d => xScale(d.frameIndex))
            .attr('y', yScale(workerId))
            .attr('width', width / data.frames.length)
            .attr('height', yScale.bandwidth())
            .attr('fill', d => activityColors[d.activity])
            .on('mouseover', function(event, d) {
                showPostureTooltip(workerId, d.frameIndex);
            })
            .on('mouseout', hidePostureTooltip);

        // Add worker ID labels
        svg.append('text')
            .attr('x', -5)
            .attr('y', yScale(workerId) + yScale.bandwidth() / 2)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'middle')
            .attr('font-family', 'Times New Roman')
            .text(workerId);
    });

    // Add time axis
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(i => data.frames[i]?.timestamp || '');
    svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

    // Add timeline drag functionality
    const timelineDrag = d3.drag()
        .on('drag', function(event) {
            const xPos = event.x - margin.left;
            const frameIndex = Math.round(xScale.invert(xPos));
            if (frameIndex >= 0 && frameIndex < data.frames.length) {
                currentFrameIndex = frameIndex;
                updateVisualization(currentFrameIndex);
            }
        });

    svg.append('rect')
        .attr('class', 'drag-area')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'transparent')
        .call(timelineDrag);
}

// Update timeline paths after zoom
function updateTimelinePaths(svg, xScale, yScale) {
    const container = document.getElementById('timeline-view');
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    // 获取当前缩放比例
    const zoomTransform = d3.zoomTransform(svg.node());
    const zoomK = zoomTransform.k;

    // 更新工人时间线的宽度
    Object.keys(data.frames[0].workers).forEach(workerId => {
        svg.selectAll(`rect.${workerId}`)
            .attr('x', d => xScale(d.frameIndex))
            .attr('width', Math.max(1, (width / data.frames.length) * zoomK));
    });

    // 更新滚动条和容器样式
    const svgWidth = width + margin.left + margin.right;
    const contentWidth = width * zoomK;
    const svgContainer = svg.node().parentNode;
    
    if (contentWidth > svgWidth) {
        // 设置滚动容器样式
        container.style.overflowX = 'scroll';
        container.style.overflowY = 'hidden';
        container.style.cursor = 'grab';
        
        // 设置SVG容器宽度
        svgContainer.setAttribute('width', contentWidth + margin.left + margin.right);

        // 添加滚动条样式
        const styleId = 'timeline-scrollbar-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                #timeline-view::-webkit-scrollbar {
                    height: 8px;
                    display: block;
                }
                #timeline-view::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                #timeline-view::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 4px;
                }
                #timeline-view::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            `;
            document.head.appendChild(style);
        }

        // 保持当前帧在可视区域内
        const currentX = xScale(currentFrameIndex);
        const containerWidth = container.clientWidth;
        const scrollLeft = currentX - containerWidth / 2;
        container.scrollLeft = Math.max(0, scrollLeft);

        // 根据缩放比例动态调整时间刻度的密度
        const tickSpacing = Math.max(50, 100 / zoomK); // 基础刻度间距随缩放调整，设置最小间距
        const tickCount = Math.max(5, Math.floor(contentWidth / tickSpacing));
        
        const xAxis = d3.axisBottom(xScale)
            .tickFormat(i => {
                const index = Math.round(i);
                return data.frames[index]?.timestamp || '';
            })
            .ticks(tickCount);

        svg.select('.x-axis')
            .attr('transform', `translate(${margin.left},${height + margin.top})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', `${Math.max(10, 12 * Math.sqrt(zoomK))}px`) // 字体大小随缩放调整
            .style('transform', `scale(${Math.min(1, 1/zoomK)})`); // 文本缩放以保持可读性

    } else {
        container.style.overflowX = 'hidden';
        container.style.cursor = 'default';
        svgContainer.setAttribute('width', svgWidth);
        
        // 更新时间轴
        const xAxis = d3.axisBottom(xScale)
            .tickFormat(i => {
                const index = Math.round(i);
                return data.frames[index]?.timestamp || '';
            })
            .ticks(Math.max(5, Math.floor(width / 100)));

        svg.select('.x-axis')
            .attr('transform', `translate(${margin.left},${height + margin.top})`)
            .call(xAxis)
            .selectAll('text')
            .style('font-size', '12px');
    }
}

// Update timeline axis after zoom
function updateTimelineAxis(svg, xScale, height) {
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(i => {
            const index = Math.round(i);
            return data.frames[index]?.timestamp || '';
        });
    svg.select('.x-axis').call(xAxis);
}

// Show posture tooltip
function showPostureTooltip(workerId, frameIndex) {
    const container = document.getElementById('timeline-view');
    const tooltip = document.createElement('div');
    tooltip.id = 'posture-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = 'white';
    tooltip.style.padding = '10px';
    tooltip.style.border = '1px solid #ddd';
    tooltip.style.borderRadius = '4px';
    tooltip.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    tooltip.style.fontFamily = 'Times New Roman';

    // Get posture information for ±10 frames
    const start = Math.max(0, frameIndex - 10);
    const end = Math.min(data.frames.length - 1, frameIndex + 10);
    const postureInfo = [];

    for (let i = start; i <= end; i++) {
        const frame = data.frames[i];
        postureInfo.push(`${frame.timestamp}: ${frame.workers[workerId].posture}`);
    }

    tooltip.innerHTML = postureInfo.join('<br>');
    container.appendChild(tooltip);

    // Position tooltip
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left + 10}px`;
    tooltip.style.top = `${event.clientY - rect.top - tooltip.offsetHeight / 2}px`;
}

// Hide posture tooltip
function hidePostureTooltip() {
    const tooltip = document.getElementById('posture-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// Setup controls
function setupControls() {
    const playPauseButton = document.getElementById('play-pause');
    const resetButton = document.getElementById('reset');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');

    playPauseButton.addEventListener('click', () => {
        if (isPlaying) {
            stopPlayback();
        } else {
            startPlayback();
        }
    });

    resetButton.addEventListener('click', () => {
        stopPlayback();
        currentFrameIndex = 0;
        updateVisualization(currentFrameIndex);
    });

    // 添加缩放按钮事件处理
    zoomInButton.addEventListener('click', () => {
        const svg = d3.select('#timeline-view svg');
        const currentZoom = d3.zoomTransform(svg.node());
        const newK = Math.min(10, currentZoom.k * 1.2); // 限制最大缩放比例为10
        const newTransform = d3.zoomIdentity.scale(newK);
        svg.call(d3.zoom().transform, newTransform);
    });

    zoomOutButton.addEventListener('click', () => {
        const svg = d3.select('#timeline-view svg');
        const currentZoom = d3.zoomTransform(svg.node());
        const newK = Math.max(1, currentZoom.k / 1.2); // 限制最小缩放比例为1
        const newTransform = d3.zoomIdentity.scale(newK);
        svg.call(d3.zoom().transform, newTransform);
    });
}

// Start playback
function startPlayback() {
    if (!data || !data.frames) {
        console.error('Data not loaded, please wait');
        return;
    }
    if (!isPlaying) {
        isPlaying = true;
        document.getElementById('play-pause').textContent = 'Pause';
        playInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % data.frames.length;
            updateVisualization(currentFrameIndex);
        }, 100);
    }
}

// Stop playback
function stopPlayback() {
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('play-pause').textContent = 'Play';
        clearInterval(playInterval);
    }
}

// Update visualization
function updateVisualization(frameIndex) {
    if (!data || !data.frames) return;
    drawPositionView();
    
    // Update timeline position indicator
    const svg = d3.select('#timeline-view svg');
    svg.selectAll('.timeline-indicator').remove();
    
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = svg.node().parentNode.clientWidth - margin.left - margin.right;
    
    const xScale = d3.scaleLinear()
        .domain([0, data.frames.length - 1])
        .range([0, width]);
    
    // Get current zoom transform and create new scale
    const currentZoom = d3.zoomTransform(svg.node());
    const newXScale = currentZoom.rescaleX(xScale);
    const zoomK = currentZoom.k;
    
    // Add timeline indicator
    svg.append('line')
        .attr('class', 'timeline-indicator')
        .attr('x1', newXScale(frameIndex))
        .attr('x2', newXScale(frameIndex))
        .attr('y1', 0)
        .attr('y2', svg.node().parentNode.clientHeight - margin.top - margin.bottom)
        .attr('stroke', '#ff0000')
        .attr('stroke-width', 2)
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // 根据缩放比例动态调整时间刻度的密度
    const tickSpacing = Math.max(50, 100 / zoomK); // 基础刻度间距随缩放调整，设置最小间距
    const tickCount = Math.max(5, Math.floor(width * zoomK / tickSpacing));
    
    // Update x-axis with dynamic ticks
    const xAxis = d3.axisBottom(newXScale)
        .tickFormat(i => {
            const index = Math.round(i);
            return data.frames[index]?.timestamp || '';
        })
        .ticks(tickCount);

    svg.select('.x-axis')
        .call(xAxis)
        .selectAll('text')
        .style('font-size', `${Math.max(10, 12 * Math.sqrt(zoomK))}px`); // 字体大小随缩放调整
}

// Helper function: convert hexadecimal color to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
        '0, 0, 0';
}

// Start app
loadData();