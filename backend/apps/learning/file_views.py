"""
File Management Views for Institution Branding System
====================================================

This module provides API endpoints for managing institution files,
branding assets, and template generation.
"""

from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import os
import json
from .models import Institution
from .auth_utils import UnifiedAuthMixin


class InstitutionFilesAPIView(UnifiedAuthMixin, APIView):
    """
    Manage files for a specific institution.
    GET: List all files for the institution
    POST: Upload a new file for the institution
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """List all files for the institution"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            # Get institution file directory
            file_dir = f"institutions/{institution.id}/files/"
            
            files = []
            if default_storage.exists(file_dir):
                # List files in the directory
                dirs, filenames = default_storage.listdir(file_dir)
                for filename in filenames:
                    file_path = os.path.join(file_dir, filename)
                    if default_storage.exists(file_path):
                        files.append({
                            'id': len(files) + 1,
                            'name': filename,
                            'path': file_path,
                            'size': default_storage.size(file_path),
                            'url': default_storage.url(file_path)
                        })
            
            return Response({
                'institution': institution.name,
                'files': files
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def post(self, request, pk):
        """Upload a new file for the institution"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            if 'file' not in request.FILES:
                return Response(
                    {'error': 'No file provided'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            uploaded_file = request.FILES['file']
            file_dir = f"institutions/{institution.id}/files/"
            file_path = os.path.join(file_dir, uploaded_file.name)
            
            # Save the file
            saved_path = default_storage.save(file_path, uploaded_file)
            
            return Response({
                'message': 'File uploaded successfully',
                'file': {
                    'name': uploaded_file.name,
                    'path': saved_path,
                    'size': uploaded_file.size,
                    'url': default_storage.url(saved_path)
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InstitutionFileDetailAPIView(UnifiedAuthMixin, APIView):
    """
    Manage a specific file for an institution.
    GET: Get file details
    DELETE: Delete the file
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, file_id):
        """Get details of a specific file"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            # This is a simplified implementation
            # In a real system, you'd have a File model with proper IDs
            file_dir = f"institutions/{institution.id}/files/"
            
            if default_storage.exists(file_dir):
                dirs, filenames = default_storage.listdir(file_dir)
                if file_id <= len(filenames):
                    filename = filenames[file_id - 1]
                    file_path = os.path.join(file_dir, filename)
                    
                    return Response({
                        'id': file_id,
                        'name': filename,
                        'path': file_path,
                        'size': default_storage.size(file_path),
                        'url': default_storage.url(file_path)
                    })
            
            raise Http404("File not found")
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, pk, file_id):
        """Delete a specific file"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            file_dir = f"institutions/{institution.id}/files/"
            
            if default_storage.exists(file_dir):
                dirs, filenames = default_storage.listdir(file_dir)
                if file_id <= len(filenames):
                    filename = filenames[file_id - 1]
                    file_path = os.path.join(file_dir, filename)
                    
                    if default_storage.exists(file_path):
                        default_storage.delete(file_path)
                        return Response({
                            'message': 'File deleted successfully'
                        })
            
            raise Http404("File not found")
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InstitutionFileDownloadAPIView(UnifiedAuthMixin, APIView):
    """
    Download a specific file for an institution.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, file_id):
        """Download a specific file"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            file_dir = f"institutions/{institution.id}/files/"
            
            if default_storage.exists(file_dir):
                dirs, filenames = default_storage.listdir(file_dir)
                if file_id <= len(filenames):
                    filename = filenames[file_id - 1]
                    file_path = os.path.join(file_dir, filename)
                    
                    if default_storage.exists(file_path):
                        file_content = default_storage.open(file_path).read()
                        response = HttpResponse(file_content)
                        response['Content-Disposition'] = f'attachment; filename="{filename}"'
                        return response
            
            raise Http404("File not found")
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InstitutionBrandingAPIView(UnifiedAuthMixin, APIView):
    """
    Manage branding assets and settings for an institution.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get branding settings and assets"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            # Get branding settings from institution model
            branding_data = {
                'institution_id': institution.id,
                'institution_name': institution.name,
                'primary_color': getattr(institution, 'primary_color', '#1f2937'),
                'secondary_color': getattr(institution, 'secondary_color', '#3b82f6'),
                'logo_url': getattr(institution, 'logo_file', None),
                'assets': []
            }
            
            # Get branding assets
            assets_dir = f"institutions/{institution.id}/branding/"
            if default_storage.exists(assets_dir):
                dirs, filenames = default_storage.listdir(assets_dir)
                for filename in filenames:
                    file_path = os.path.join(assets_dir, filename)
                    branding_data['assets'].append({
                        'name': filename,
                        'url': default_storage.url(file_path),
                        'type': 'logo' if 'logo' in filename.lower() else 'asset'
                    })
            
            return Response(branding_data)
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def post(self, request, pk):
        """Update branding settings or upload assets"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            
            # Handle file upload
            if 'logo' in request.FILES:
                logo_file = request.FILES['logo']
                assets_dir = f"institutions/{institution.id}/branding/"
                logo_path = os.path.join(assets_dir, f"logo_{logo_file.name}")
                
                saved_path = default_storage.save(logo_path, logo_file)
                
                # Update institution logo
                if hasattr(institution, 'logo_file'):
                    institution.logo_file = default_storage.url(saved_path)
                    institution.save()
                
                return Response({
                    'message': 'Logo uploaded successfully',
                    'logo_url': default_storage.url(saved_path)
                })
            
            # Handle branding settings update
            if 'primary_color' in request.data or 'secondary_color' in request.data:
                if hasattr(institution, 'primary_color'):
                    institution.primary_color = request.data.get('primary_color', institution.primary_color)
                if hasattr(institution, 'secondary_color'):
                    institution.secondary_color = request.data.get('secondary_color', institution.secondary_color)
                
                institution.save()
                
                return Response({
                    'message': 'Branding settings updated successfully'
                })
            
            return Response(
                {'error': 'No valid data provided'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InstitutionTemplateGeneratorAPIView(UnifiedAuthMixin, APIView):
    """
    Generate branded templates for an institution.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Generate a branded template"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            template_type = request.data.get('template_type', 'pdf')
            
            if template_type == 'pdf':
                # Generate a sample PDF template
                from .pdf_reports import create_branded_report_header
                
                # This would generate a sample PDF with the institution's branding
                template_data = {
                    'institution': institution.name,
                    'template_type': 'PDF Report Template',
                    'primary_color': getattr(institution, 'primary_color', '#1f2937'),
                    'secondary_color': getattr(institution, 'secondary_color', '#3b82f6'),
                    'logo_url': getattr(institution, 'logo_file', None),
                    'generated_at': 'now'
                }
                
                return Response({
                    'message': 'Template generated successfully',
                    'template': template_data
                })
            
            return Response(
                {'error': 'Unsupported template type'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )