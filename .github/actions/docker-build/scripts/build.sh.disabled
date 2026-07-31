name: Docker Build
description: Enterprise reusable Docker build action with cache, immutable digest outputs, OCI labels, and metadata.

inputs:
  registry:
    description: Registry hostname
    required: true

  username:
    description: Registry username
    required: true

  password:
    description: Registry password/token
    required: true

  image_name:
    description: Full image repository path
    required: true

  image_tag:
    description: Primary tag
    required: true

  context:
    description: Build context
    required: false
    default: .

  dockerfile:
    description: Dockerfile path
    required: false
    default: Dockerfile

  push:
    description: Push image
    required: false
    default: "true"

  platforms:
    description: Target platforms
    required: false
    default: linux/amd64

  additional_tags:
    description: Extra newline-separated tags
    required: false
    default: ""

outputs:
  image_ref:
    description: Immutable digest reference
    value: ${{ steps.out.outputs.image_ref }}

  digest:
    description: Image digest
    value: ${{ steps.build.outputs.digest }}

  tags:
    description: Published tags
    value: ${{ steps.meta.outputs.tags }}

runs:
  using: composite

  steps:
    - name: Validate Inputs
      shell: bash
      run: |
        test -n "${{ inputs.registry }}"
        test -n "${{ inputs.username }}"
        test -n "${{ inputs.password }}"
        test -n "${{ inputs.image_name }}"
        test -n "${{ inputs.image_tag }}"
        test -f "${{ inputs.context }}/${{ inputs.dockerfile }}"

    - name: Setup Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Login Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ inputs.registry }}
        username: ${{ inputs.username }}
        password: ${{ inputs.password }}

    - name: Generate Metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ inputs.image_name }}
        tags: |
          type=raw,value=${{ inputs.image_tag }}
          type=sha
        labels: |
          org.opencontainers.image.title=${{ inputs.image_name }}
          org.opencontainers.image.source=${{ github.server_url }}/${{ github.repository }}
          org.opencontainers.image.revision=${{ github.sha }}
          org.opencontainers.image.created=${{ github.run_id }}

    - name: Build and Push
      id: build
      uses: docker/build-push-action@v5
      with:
        context: ${{ inputs.context }}
        file: ${{ inputs.context }}/${{ inputs.dockerfile }}
        push: ${{ inputs.push }}
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        platforms: ${{ inputs.platforms }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        provenance: false

    - name: Export Outputs
      id: out
      shell: bash
      run: |
        echo "image_ref=${{ inputs.image_name }}@${{ steps.build.outputs.digest }}" >> $GITHUB_OUTPUT

    - name: Publish Summary
      shell: bash
      run: |
        echo "## Docker Build Completed" >> $GITHUB_STEP_SUMMARY
        echo "- Image: ${{ inputs.image_name }}" >> $GITHUB_STEP_SUMMARY
        echo "- Digest: ${{ steps.build.outputs.digest }}" >> $GITHUB_STEP_SUMMARY
        echo "- Immutable Ref: ${{ steps.out.outputs.image_ref }}" >> $GITHUB_STEP_SUMMARY
        echo "- Cache: gha mode=max enabled" >> $GITHUB_STEP_SUMMARY
