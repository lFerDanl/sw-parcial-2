package com.example.demo.service;

import com.example.demo.entity.Libro;
import com.example.demo.dto.LibroDTO;
import com.example.demo.repository.LibroRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

    import java.util.List;

    import java.util.Optional;
    import java.util.stream.Collectors;

@Service
@Transactional
public class LibroService {

    @Autowired
    private LibroRepository libroRepository;


    public List<LibroDTO> findAll() {
        return libroRepository.findAll().stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
    }

    public Optional<LibroDTO> findById(Long id) {
        return libroRepository.findById(id)
            .map(this::convertToDTO);
    }

    public LibroDTO create(LibroDTO libroDTO) {
        Libro libro = convertToEntity(libroDTO);
        Libro saved = libroRepository.save(libro);
        return convertToDTO(saved);
    }

    public Optional<LibroDTO> update(Long id, LibroDTO libroDTO) {
        return libroRepository.findById(id)
            .map(existing -> {
                updateEntityFromDTO(existing, libroDTO);
                return convertToDTO(libroRepository.save(existing));
            });
    }

    public boolean delete(Long id) {
        if (libroRepository.existsById(id)) {
            libroRepository.deleteById(id);
            return true;
        }
        return false;
    }

    private LibroDTO convertToDTO(Libro libro) {
        if (libro == null) return null;
        
        LibroDTO dto = new LibroDTO();
        dto.setId(libro.getId());
        dto.setTitulo(libro.getTitulo());
        dto.setAutor(libro.getAutor());
        dto.setIsbn(libro.getIsbn());

        return dto;
    }

    private Libro convertToEntity(LibroDTO dto) {
        if (dto == null) return null;
        
        Libro libro = new Libro();
        libro.setTitulo(dto.getTitulo());
        libro.setAutor(dto.getAutor());
        libro.setIsbn(dto.getIsbn());

        return libro;
    }

    private void updateEntityFromDTO(Libro libro, LibroDTO dto) {
        if (dto == null) return;
        
        libro.setTitulo(dto.getTitulo());
        libro.setAutor(dto.getAutor());
        libro.setIsbn(dto.getIsbn());

    }
}
