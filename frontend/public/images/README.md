# College Logo Setup

## Instructions for Adding College Logo

1. **Add your college logo** to this directory with the filename `college_logo.png`
2. **Recommended specifications:**
   - Format: PNG (with transparent background preferred)
   - Size: 400x200 pixels (2:1 aspect ratio)
   - Resolution: 300 DPI for print quality
   - File size: Under 500KB

3. **Alternative formats supported:**
   - `college_logo.jpg`
   - `college_logo.jpeg`
   - `college_logo.gif`

## PDF Report Integration

The logo will automatically appear in:
- PDF performance reports header
- Institutional branding section
- Export documents

## Fallback Behavior

If no logo is found, the PDF reports will display:
- Institution name only
- Text-based header
- Professional formatting without logo

## File Structure
```
frontend/public/images/
├── college_logo.png          # Main logo (recommended)
├── college_logo_dark.png     # Dark theme variant (optional)
└── README.md                 # This file
```

## Testing

After adding your logo:
1. Generate a PDF report from the Advanced Student Filter
2. Verify the logo appears correctly in the header
3. Check that the logo scales properly

## Troubleshooting

- **Logo not appearing:** Check file name and format
- **Logo too large:** Resize to recommended dimensions
- **Poor quality:** Use higher resolution source image
- **File not found errors:** Ensure file is in correct directory